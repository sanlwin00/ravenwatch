"""
RavenWatch translation service — OpenAI GPT-4o-mini.

Translates Chinese-language article text to English.
GPT-4o-mini: ~$0.15/1M input tokens, $0.60/1M output tokens.
At ~30 articles/day this runs ~$0.50–0.80/month.
"""
from __future__ import annotations

import logging
import os

from openai import AsyncOpenAI
from supabase import Client

logger = logging.getLogger(__name__)

MAX_CHARS = 50_000
TRUNCATION_NOTE = "\n\n[Translation truncated: original text exceeded 50,000 characters]"


async def translate_text(text: str, target_lang: str = "EN-US") -> str | None:
    """
    Translate text to English using GPT-4o-mini.
    Returns translated text or None on failure.
    Skips translation if text appears to already be English.
    Truncates text that exceeds MAX_CHARS rather than failing.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping translation")
        return None

    if len(text) > MAX_CHARS:
        logger.warning(
            "Text length %d exceeds %d chars — truncating before translation",
            len(text),
            MAX_CHARS,
        )
        text = text[:MAX_CHARS] + TRUNCATION_NOTE

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional translator specializing in Chinese–English translation "
                        "for geopolitical and news content. Translate the following Chinese text to English. "
                        "Preserve proper nouns, entity names, and technical terms accurately. "
                        "Return only the translated text with no commentary."
                    ),
                },
                {"role": "user", "content": text},
            ],
            temperature=0.1,
        )
        translated = response.choices[0].message.content
        if not translated:
            logger.error("OpenAI returned empty translation")
            return None
        return translated.strip()

    except Exception as exc:
        logger.error("OpenAI translation exception: %s", exc)
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
    Find all articles with translation_status='pending' and translate them.
    Marks each article 'done' or 'failed' in translation_status.
    Returns {"translated": N, "failed": N, "skipped": N}.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping batch translation")
        return {"translated": 0, "failed": 0, "skipped": 0}

    try:
        result = (
            db.table("articles")
            .select("id, language_original, raw_text_original")
            .eq("translation_status", "pending")
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

        if (article.get("language_original") or "").lower() == "en":
            raw_original = article.get("raw_text_original") or ""
            if raw_original:
                try:
                    db.table("articles").update({
                        "raw_text_en": raw_original,
                        "translation_status": "done",
                    }).eq("id", article_id).execute()
                    translated += 1
                except Exception as exc:
                    logger.warning("Failed to copy raw_text_original for English article %s: %s", article_id, exc)
                    db.table("articles").update({"translation_status": "failed"}).eq("id", article_id).execute()
                    failed += 1
            else:
                db.table("articles").update({"translation_status": "failed"}).eq("id", article_id).execute()
                skipped += 1
            continue

        success = await translate_article(article_id, db)
        if success:
            db.table("articles").update({"translation_status": "done"}).eq("id", article_id).execute()
            translated += 1
        else:
            db.table("articles").update({"translation_status": "failed"}).eq("id", article_id).execute()
            failed += 1

    summary = {"translated": translated, "failed": failed, "skipped": skipped}
    logger.info("Translation batch complete: %s", summary)
    return summary
