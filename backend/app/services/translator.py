"""
RavenWatch translation service — DeepL integration.

Translates Chinese-language article text to English using the DeepL free tier.
DeepL free tier limit: 500K chars/month (~30 articles/day is well within bounds).
"""
from __future__ import annotations

import asyncio
import logging
import os

import httpx
from supabase import Client

logger = logging.getLogger(__name__)

DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"
MAX_CHARS = 50_000  # DeepL safe limit per request; truncate beyond this
TRUNCATION_NOTE = "\n\n[Translation truncated: original text exceeded 50,000 characters]"
RATE_LIMIT_WAIT = 2  # seconds to wait before retry on 429


async def translate_text(text: str, target_lang: str = "EN-US") -> str | None:
    """
    Translate text to English using DeepL API.
    Returns translated text or None on failure.
    Skips translation if DeepL detects the source is already English.
    Truncates text that exceeds MAX_CHARS rather than failing.
    """
    api_key = os.environ.get("DEEPL_API_KEY", "")
    if not api_key:
        logger.warning("DEEPL_API_KEY not set — skipping translation")
        return None

    # Truncate oversized text
    if len(text) > MAX_CHARS:
        logger.warning(
            "Text length %d exceeds %d chars — truncating before translation",
            len(text),
            MAX_CHARS,
        )
        text = text[:MAX_CHARS] + TRUNCATION_NOTE

    payload = {
        "text": [text],
        "target_lang": target_lang,
        "source_lang": "ZH",
    }
    headers = {"Authorization": f"DeepKey {api_key}"}

    async def _post() -> httpx.Response:
        async with httpx.AsyncClient(timeout=30) as client:
            return await client.post(DEEPL_API_URL, headers=headers, json=payload)

    try:
        resp = await _post()

        # Rate limit — wait and retry once
        if resp.status_code == 429:
            logger.warning("DeepL rate limit hit — waiting %ds before retry", RATE_LIMIT_WAIT)
            await asyncio.sleep(RATE_LIMIT_WAIT)
            resp = await _post()

        if resp.status_code != 200:
            logger.error("DeepL API returned %s: %s", resp.status_code, resp.text)
            return None

        data = resp.json()
        translations = data.get("translations", [])
        if not translations:
            logger.error("DeepL returned empty translations list")
            return None

        translation = translations[0]
        detected_lang = translation.get("detected_source_language", "").upper()

        # Skip if source is already English
        if detected_lang.startswith("EN"):
            logger.info("Source language detected as English — skipping translation")
            return None

        return translation.get("text")

    except Exception as exc:
        logger.error("DeepL translation exception: %s", exc)
        return None


async def translate_article(article_id: str, db: Client) -> bool:
    """
    Fetch article by ID, translate raw_text_original → raw_text_en.
    Updates the articles table. Returns True on success.
    """
    try:
        result = (
            db.table("articles")
            .select("id, raw_text_original, language_original")
            .eq("id", article_id)
            .single()
            .execute()
        )
        article = result.data
    except Exception as exc:
        logger.error("Failed to fetch article %s: %s", article_id, exc)
        return False

    if not article:
        logger.warning("Article %s not found", article_id)
        return False

    # Skip English-language sources
    if (article.get("language_original") or "").lower() == "en":
        logger.debug("Article %s is already English — skipping", article_id)
        return False

    raw_text = article.get("raw_text_original")
    if not raw_text:
        logger.debug("Article %s has no raw_text_original — skipping", article_id)
        return False

    translated = await translate_text(raw_text)
    if translated is None:
        return False

    try:
        db.table("articles").update({"raw_text_en": translated}).eq("id", article_id).execute()
        logger.info("Translated article %s", article_id)
        return True
    except Exception as exc:
        logger.error("Failed to update raw_text_en for article %s: %s", article_id, exc)
        return False


async def translate_pending_articles(db: Client) -> dict:
    """
    Find all articles where raw_text_en IS NULL and raw_text_original IS NOT NULL.
    Translates each one. Returns {"translated": N, "failed": N, "skipped": N}.
    """
    api_key = os.environ.get("DEEPL_API_KEY", "")
    if not api_key:
        logger.warning("DEEPL_API_KEY not set — skipping batch translation")
        return {"translated": 0, "failed": 0, "skipped": 0}

    try:
        result = (
            db.table("articles")
            .select("id, language_original")
            .is_("raw_text_en", "null")
            .not_.is_("raw_text_original", "null")
            .execute()
        )
        pending = result.data or []
    except Exception as exc:
        logger.error("Failed to query pending articles: %s", exc)
        return {"translated": 0, "failed": 0, "skipped": 0}

    translated = 0
    failed = 0
    skipped = 0

    for article in pending:
        article_id = str(article["id"])

        # Skip English-language sources upfront
        if (article.get("language_original") or "").lower() == "en":
            logger.debug("Article %s is English — skipping", article_id)
            skipped += 1
            continue

        success = await translate_article(article_id, db)
        if success:
            translated += 1
        else:
            failed += 1

    summary = {"translated": translated, "failed": failed, "skipped": skipped}
    logger.info("Translation batch complete: %s", summary)
    return summary
