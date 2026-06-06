"""
RavenWatch scraper service.

Flow per source:
  1. Try Firecrawl API (async httpx)
  2. Fall back to requests + BeautifulSoup if Firecrawl fails
  3. Deduplicate against the articles table by URL
  4. Insert new articles with correct signal flags and expiry
  5. Update sources.last_scraped_at
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import requests
from bs4 import BeautifulSoup
from supabase import Client

from app.services.translator import translate_pending_articles
from app.services.tagger import tag_pending_articles
from app.services.alert_service import send_scrape_summary_email

logger = logging.getLogger(__name__)

FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v1/scrape"
BS4_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RavenWatch/1.0)"}
BS4_TIMEOUT = 15  # seconds
DEFAULT_RETENTION_DAYS = 30


# ---------------------------------------------------------------------------
# Low-level fetchers
# ---------------------------------------------------------------------------


async def _scrape_firecrawl(url: str) -> Optional[dict]:
    """
    Try Firecrawl.  Returns {title, url, raw_text, published_at} or None on any failure.
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        logger.debug("FIRECRAWL_API_KEY not set — skipping Firecrawl for %s", url)
        return None

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                FIRECRAWL_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"url": url, "formats": ["markdown"]},
            )
        if resp.status_code != 200:
            logger.warning(
                "Firecrawl returned %s for %s — falling back to BS4",
                resp.status_code,
                url,
            )
            return None

        data = resp.json()
        # Firecrawl v1 shape: {"success": true, "data": {"markdown": "...", "metadata": {...}}}
        result = data.get("data", {})
        raw_text = result.get("markdown") or result.get("content") or ""
        metadata = result.get("metadata", {})
        title = metadata.get("title") or metadata.get("ogTitle") or ""
        published_at_raw = metadata.get("publishedTime") or metadata.get("article:published_time")

        published_at: Optional[datetime] = None
        if published_at_raw:
            try:
                published_at = datetime.fromisoformat(published_at_raw.replace("Z", "+00:00"))
            except ValueError:
                pass

        return {
            "title": title,
            "url": url,
            "raw_text": raw_text,
            "published_at": published_at,
        }

    except Exception as exc:
        logger.warning("Firecrawl exception for %s: %s — falling back to BS4", url, exc)
        return None


def _scrape_bs4_sync(url: str) -> Optional[dict]:
    """
    Synchronous BeautifulSoup fallback.  Called via asyncio.to_thread.
    Returns {title, url, raw_text, published_at} or None.
    """
    try:
        resp = requests.get(url, timeout=BS4_TIMEOUT, headers=BS4_HEADERS)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("BS4 request failed for %s: %s", url, exc)
        return None

    try:
        soup = BeautifulSoup(resp.content, "lxml")

        # Remove noise
        for tag in soup(["script", "style", "noscript", "iframe"]):
            tag.decompose()

        # Title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        if not title:
            h1 = soup.find("h1")
            if h1:
                title = h1.get_text(strip=True)

        # Body text — prefer semantic containers
        body_el = (
            soup.find("article")
            or soup.find("main")
            or soup.find("body")
        )
        raw_text = body_el.get_text(separator="\n", strip=True) if body_el else ""

        return {
            "title": title,
            "url": url,
            "raw_text": raw_text,
            "published_at": None,
        }

    except Exception as exc:
        logger.warning("BS4 parse error for %s: %s", url, exc)
        return None


async def _scrape_bs4(url: str) -> Optional[dict]:
    """Async wrapper around the synchronous BS4 scraper."""
    return await asyncio.to_thread(_scrape_bs4_sync, url)


async def _fetch_article(url: str) -> Optional[dict]:
    """Fetch a single article URL, trying Firecrawl first then BS4."""
    result = await _scrape_firecrawl(url)
    if result is None:
        result = await _scrape_bs4(url)
    return result


# ---------------------------------------------------------------------------
# Per-source scrape
# ---------------------------------------------------------------------------


async def scrape_source(source: dict) -> list[dict]:
    """
    Scrape a single source (its homepage / landing URL).
    Returns a list of article dicts ready for insertion.

    Each dict has the shape expected by _insert_article:
      title, url, raw_text, published_at, source (the source dict).
    """
    url: str = source.get("url", "")
    name: str = source.get("name", url)

    logger.info("Scraping source: %s (%s)", name, url)

    article = await _fetch_article(url)
    if article is None:
        logger.warning("No content returned for source %s", name)
        return []

    # Attach the source record so _insert_article can use it
    article["source"] = source
    return [article]


# ---------------------------------------------------------------------------
# Retention helper
# ---------------------------------------------------------------------------


def _get_retention_days(db: Client) -> int:
    try:
        result = (
            db.table("platform_settings")
            .select("value")
            .eq("key", "retention_days")
            .single()
            .execute()
        )
        return int(result.data["value"])
    except Exception:
        return DEFAULT_RETENTION_DAYS


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def _url_exists(db: Client, url: str) -> bool:
    """Return True if this URL is already in the articles table."""
    try:
        result = db.table("articles").select("id").eq("url", url).execute()
        return bool(result.data)
    except Exception as exc:
        logger.error("Dedup check failed for %s: %s", url, exc)
        return False  # safer to attempt insert than to silently skip


def _insert_article(db: Client, article: dict, retention_days: int) -> bool:
    """
    Insert a scraped article dict into the articles table.
    Returns True if inserted, False if skipped or errored.
    """
    url = article.get("url", "")
    source = article.get("source", {})

    if _url_exists(db, url):
        logger.debug("Duplicate URL skipped: %s", url)
        return False

    source_type = source.get("type", "")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=retention_days)

    published_at = article.get("published_at")
    published_at_iso: Optional[str] = None
    if isinstance(published_at, datetime):
        published_at_iso = published_at.isoformat()

    row = {
        "source_id": source.get("id"),
        "title": article.get("title") or None,
        "url": url,
        "published_at": published_at_iso,
        "raw_text_original": article.get("raw_text") or None,
        "raw_text_en": None,  # translation is OSINT-03
        "language_original": source.get("language", "zh"),
        "scraped_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "is_early_signal": source_type == "yunnan",
        "is_policy_signal": source_type == "thinktank",
    }

    try:
        db.table("articles").insert(row).execute()
        logger.info("Inserted article: %s", url)
        return True
    except Exception as exc:
        logger.error("Failed to insert article %s: %s", url, exc)
        return False


def _update_last_scraped(db: Client, source_id: str) -> None:
    try:
        db.table("sources").update(
            {"last_scraped_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", source_id).execute()
    except Exception as exc:
        logger.error("Failed to update last_scraped_at for source %s: %s", source_id, exc)


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------


async def scrape_all_sources(db: Client) -> dict:
    """
    Scrape all active sources.
    Returns a summary dict: {sources_attempted, articles_found, articles_inserted}.
    """
    # Load active sources
    try:
        result = db.table("sources").select("*").eq("active", True).execute()
        active_sources: list[dict] = result.data or []
    except Exception as exc:
        logger.error("Failed to load sources: %s", exc)
        return {"error": str(exc), "sources_attempted": 0, "articles_found": 0, "articles_inserted": 0}

    if not active_sources:
        logger.warning("No active sources found — did you run seed_sources()?")
        return {"sources_attempted": 0, "articles_found": 0, "articles_inserted": 0}

    retention_days = _get_retention_days(db)

    sources_attempted = 0
    articles_found = 0
    articles_inserted = 0

    for source in active_sources:
        sources_attempted += 1
        try:
            articles = await scrape_source(source)
            articles_found += len(articles)

            for article in articles:
                if _insert_article(db, article, retention_days):
                    articles_inserted += 1

            # Always update last_scraped_at even if no new articles
            if source.get("id"):
                _update_last_scraped(db, source["id"])

        except Exception as exc:
            logger.error("Unhandled error scraping source %s: %s", source.get("name"), exc)

    # Translate any newly inserted (and previously untranslated) articles
    translation_summary = await translate_pending_articles(db)
    articles_translated = translation_summary.get("translated", 0)

    # Tag translated articles with entities and topics
    tagging_summary = await tag_pending_articles(db)
    articles_tagged = tagging_summary.get("tagged", 0)

    summary = {
        "sources_attempted": sources_attempted,
        "articles_found": articles_found,
        "articles_inserted": articles_inserted,
        "articles_translated": articles_translated,
        "articles_tagged": articles_tagged,
        "retention_days": retention_days,
    }
    logger.info("Scrape complete: %s", summary)

    # Send email notifications to all registered users
    email_result = await send_scrape_summary_email(db, summary)
    summary["emails_sent"] = email_result.get("sent", 0)

    return summary
