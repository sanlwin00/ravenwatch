"""
RavenWatch scraper service.

Flow per source:
  1. Fetch the article listing page (source URL)
  2. Extract individual article links (via Firecrawl links format, falling back to BS4)
  3. Follow pagination up to 3 pages per source
  4. For each new (not yet in DB) article link, scrape full content
  5. Deduplicate against the articles table by URL
  6. Insert new articles with correct signal flags and expiry
  7. Update sources.last_scraped_at
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse, urljoin

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

# Per-source crawl limits
MAX_LINKS_PER_PAGE = 15
MAX_LISTING_PAGES = 3
MAX_NEW_ARTICLES_PER_SOURCE = 20


# ---------------------------------------------------------------------------
# Link filtering heuristic
# ---------------------------------------------------------------------------


def _is_article_link(link: str, base_url: str) -> bool:
    """Heuristic: is this link likely to be an individual news article?"""
    try:
        parsed = urlparse(link)
        base = urlparse(base_url)
    except Exception:
        return False

    # Skip fragments, javascript, mailto
    if not link or link.startswith('#') or link.startswith('javascript') or link.startswith('mailto'):
        return False

    # Must be same domain
    if parsed.netloc and parsed.netloc != base.netloc:
        return False

    path = parsed.path.rstrip('/')

    segments = [s for s in path.split('/') if s]
    if len(segments) < 2:
        return False

    # Skip exact generic paths
    generic_paths = {'/en', '/news', '/about', '/contact', '/home', '/search',
                     '/category', '/tag', '/author', '/feed', '/rss', '/sitemap'}
    if path in generic_paths:
        return False

    # Skip paths whose last segment is a generic section/service word
    nav_keywords = {
        'about', 'contact', 'search', 'category', 'categories', 'tag', 'tags',
        'author', 'feed', 'rss', 'sitemap', 'home', 'index', 'archive', 'archives',
        'page', 'login', 'register', 'subscribe', 'newsletter', 'policy', 'privacy',
        'terms', 'services', 'service', 'consularservices', 'visas', 'legalization',
        'passports', 'authentication', 'notarization', 'eng', 'cn', 'en', 'zh',
    }
    last_segment = segments[-1].lower().rstrip('/')
    if last_segment in nav_keywords:
        return False

    # Positive signals: date, numeric ID, .html extension
    has_date = bool(re.search(r'/20\d{2}[/_\-]', link))
    has_html = path.endswith('.html') or path.endswith('.htm')
    has_numeric_id = bool(re.search(r'/\d{4,}', path))
    # Long slug: final segment looks like a real article title (contains letters, long enough)
    has_title_slug = (
        len(segments) >= 3
        and len(last_segment) >= 10
        and re.search(r'[a-zA-Z一-鿿]', last_segment)
        and not last_segment.isdigit()
    )

    return has_date or has_html or has_numeric_id or has_title_slug


# ---------------------------------------------------------------------------
# Pagination link detection
# ---------------------------------------------------------------------------


def _find_next_page(soup: BeautifulSoup, current_url: str) -> Optional[str]:
    """
    Look for a 'next page' link in parsed HTML.
    Returns the absolute URL of the next page, or None.
    """
    next_patterns = re.compile(
        r'\b(next|older|下一页|下一頁|›|»|older\s+posts?|next\s+page)\b',
        re.IGNORECASE
    )

    for a_tag in soup.find_all('a', href=True):
        text = a_tag.get_text(strip=True)
        href = a_tag['href']

        if not text and not href:
            continue

        # Match link text
        if next_patterns.search(text):
            abs_url = urljoin(current_url, href)
            if abs_url != current_url:
                return abs_url

        # Match href patterns like ?page=N, /page/N/, ?start=N
        if re.search(r'[?/](page[=/]\d+|start=\d+)', href, re.IGNORECASE):
            abs_url = urljoin(current_url, href)
            if abs_url != current_url:
                return abs_url

    return None


# ---------------------------------------------------------------------------
# Link extraction from listing pages
# ---------------------------------------------------------------------------


async def _extract_article_links_firecrawl(
    listing_url: str, source: dict
) -> tuple[list[str], Optional[str]]:
    """
    Use Firecrawl with formats=["links"] to extract candidate article URLs.
    Returns (article_urls, next_page_url_or_None).
    """
    api_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not api_key:
        return [], None

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                FIRECRAWL_ENDPOINT,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"url": listing_url, "formats": ["links"]},
            )
        if resp.status_code != 200:
            logger.warning(
                "Firecrawl links request returned %s for %s",
                resp.status_code, listing_url
            )
            return [], None

        data = resp.json()
        result = data.get("data", {})
        raw_links: list[str] = result.get("links") or []

        article_links = []
        for link in raw_links:
            abs_link = urljoin(listing_url, link)
            if _is_article_link(abs_link, listing_url):
                article_links.append(abs_link)
            if len(article_links) >= MAX_LINKS_PER_PAGE:
                break

        # Firecrawl doesn't return next-page link natively; we need the HTML for that.
        # Return links only; caller falls back to BS4 for pagination.
        return article_links, None

    except Exception as exc:
        logger.warning("Firecrawl links exception for %s: %s", listing_url, exc)
        return [], None


def _extract_article_links_bs4_sync(
    listing_url: str, source: dict
) -> tuple[list[str], Optional[str]]:
    """
    Synchronous BS4-based link extraction from a listing page.
    Returns (article_urls, next_page_url_or_None).
    """
    try:
        resp = requests.get(listing_url, timeout=BS4_TIMEOUT, headers=BS4_HEADERS)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("BS4 listing request failed for %s: %s", listing_url, exc)
        return [], None

    try:
        soup = BeautifulSoup(resp.content, "lxml")

        article_links = []
        seen = set()
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            if not href:
                continue
            abs_link = urljoin(listing_url, href)
            if abs_link in seen:
                continue
            seen.add(abs_link)
            if _is_article_link(abs_link, listing_url):
                article_links.append(abs_link)
            if len(article_links) >= MAX_LINKS_PER_PAGE:
                break

        next_page = _find_next_page(soup, listing_url)
        return article_links, next_page

    except Exception as exc:
        logger.warning("BS4 listing parse error for %s: %s", listing_url, exc)
        return [], None


async def _extract_article_links(
    listing_url: str, source: dict
) -> tuple[list[str], Optional[str]]:
    """
    Extract article links from a listing page.
    Tries Firecrawl first for the link list; always uses BS4 for pagination detection.
    Returns (article_link_list, next_page_url_or_None).
    """
    # Try Firecrawl for links
    fc_links, _ = await _extract_article_links_firecrawl(listing_url, source)

    # Always run BS4 to get both fallback links AND pagination
    bs4_links, next_page = await asyncio.to_thread(
        _extract_article_links_bs4_sync, listing_url, source
    )

    # Merge: prefer Firecrawl links if we got them, supplement with BS4
    if fc_links:
        # Combine, dedup, cap
        seen = set(fc_links)
        combined = list(fc_links)
        for link in bs4_links:
            if link not in seen:
                combined.append(link)
                seen.add(link)
        links = combined[:MAX_LINKS_PER_PAGE]
    else:
        links = bs4_links[:MAX_LINKS_PER_PAGE]

    return links, next_page


# ---------------------------------------------------------------------------
# Low-level article fetchers
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


async def scrape_source(source: dict, db: Client) -> list[dict]:
    """
    Scrape a single source using multi-level article crawling:
      1. Fetch listing page(s) and extract individual article links
      2. Follow pagination up to MAX_LISTING_PAGES
      3. For each new (not yet in DB) article link, scrape full content

    Returns a list of article dicts ready for insertion.
    Each dict has the shape: title, url, raw_text, published_at, source.
    """
    listing_url: str = source.get("url", "")
    name: str = source.get("name", listing_url)

    logger.info("Scraping source: %s (%s)", name, listing_url)

    all_article_urls: list[str] = []
    next_page_url: Optional[str] = listing_url

    for page_num in range(MAX_LISTING_PAGES):
        if not next_page_url:
            break

        logger.debug("Extracting links from listing page %d: %s", page_num + 1, next_page_url)
        links, next_page_url = await _extract_article_links(next_page_url, source)

        if not links:
            logger.debug("No article links found on page %d for %s", page_num + 1, name)
            break

        all_article_urls.extend(links)
        logger.debug(
            "Found %d links on page %d for %s (total so far: %d)",
            len(links), page_num + 1, name, len(all_article_urls)
        )

        # Hard cap: no need to fetch more listing pages
        if len(all_article_urls) >= MAX_LISTING_PAGES * MAX_LINKS_PER_PAGE:
            break

    if not all_article_urls:
        logger.warning("No article links extracted for source %s — no articles to scrape", name)
        return []

    # Dedup against DB and cap total new articles
    new_urls = [u for u in all_article_urls if not _url_exists(db, u)]
    new_urls = new_urls[:MAX_NEW_ARTICLES_PER_SOURCE]

    logger.info(
        "Source %s: %d candidate links → %d new (after dedup, cap %d)",
        name, len(all_article_urls), len(new_urls), MAX_NEW_ARTICLES_PER_SOURCE
    )

    articles = []
    for url in new_urls:
        article = await _fetch_article(url)
        if article:
            article["source"] = source
            articles.append(article)

    return articles


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
        "title": article.get("title") or f"[{source.get('name', 'Unknown')}] {now.strftime('%Y-%m-%d')}",
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
            articles = await scrape_source(source, db)
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
