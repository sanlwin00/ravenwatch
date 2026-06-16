"""
RavenWatch tagger service — GPT-4o-mini entity and topic auto-tagging.

Flow:
  1. Fetch all watchlist entities from DB once
  2. For each untagged article, call GPT-4o-mini with entity list + article text
  3. Insert matched entity IDs → article_entities
  4. Insert matched topics → article_topics
  5. Update narrative_metrics term frequency counts
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, timezone, datetime

from supabase import Client

logger = logging.getLogger(__name__)

TOPICS = ["ceasefire", "mediation", "border_security", "election", "bri"]

# Narrative metric terms: (English term, Chinese term)
NARRATIVE_TERMS = [
    ("peace", "和平"),
    ("stability", "稳定"),
    ("ceasefire", "停火"),
    ("elections", "选举"),
    ("sovereignty", "主权"),
]

GPT_MAX_TEXT_CHARS = 4000
GPT_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = (
    "You are an OSINT analyst tagging news articles about China-Myanmar relations.\n"
    "Given an article text, identify:\n"
    "1. Which entities from the watchlist are mentioned (by name or alias)\n"
    "2. Which topics apply: ceasefire, mediation, border_security, election, bri\n"
    "3. A 1-2 sentence English summary of the article's key intelligence value\n\n"
    'Return JSON only: {"matched_entities": [{"id": "...", "matched_alias": "..."}], "topics": [...], "summary": "..."}'
)


# ---------------------------------------------------------------------------
# GPT extraction
# ---------------------------------------------------------------------------


async def _extract_with_gpt(text: str, entities: list[dict]) -> dict:
    """
    Call GPT-4o-mini to extract matched entities and topics from text.
    Returns {"entity_ids": [...], "topics": [...], "matched_aliases": {entity_id: alias}}
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping GPT extraction")
        return {"entity_ids": [], "topics": [], "matched_aliases": {}}

    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("openai package not installed — cannot tag articles")
        return {"entity_ids": [], "topics": [], "matched_aliases": {}}

    # Build entity list for the prompt
    entity_lines: list[str] = []
    for e in entities:
        names = [e["name"]]
        if e.get("name_zh"):
            names.append(e["name_zh"])
        # aliases may be a list of strings or dicts
        for alias in e.get("aliases") or []:
            if isinstance(alias, str):
                names.append(alias)
            elif isinstance(alias, dict):
                for v in alias.values():
                    if isinstance(v, str):
                        names.append(v)
        entity_lines.append(f'- id: {e["id"]}  names: {", ".join(names)}')

    entity_block = "\n".join(entity_lines) if entity_lines else "(no entities in watchlist)"
    truncated_text = text[:GPT_MAX_TEXT_CHARS]

    user_message = (
        f"WATCHLIST ENTITIES:\n{entity_block}\n\n"
        f"ARTICLE TEXT:\n{truncated_text}\n\n"
        f"VALID TOPICS: {', '.join(TOPICS)}"
    )

    client = AsyncOpenAI(api_key=api_key)

    try:
        response = await client.chat.completions.create(
            model=GPT_MODEL,
            response_format={"type": "json_object"},
            max_tokens=500,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("GPT returned invalid JSON: %s", exc)
        return {"entity_ids": [], "topics": [], "matched_aliases": {}}
    except Exception as exc:
        logger.error("GPT API call failed: %s", exc)
        return {"entity_ids": [], "topics": [], "matched_aliases": {}}

    matched_entities: list[dict] = data.get("matched_entities") or []
    raw_topics: list[str] = data.get("topics") or []
    summary: str = str(data.get("summary") or "").strip()

    # Validate topics against known list
    valid_topics = [t for t in raw_topics if t in TOPICS]

    entity_ids: list[str] = []
    matched_aliases: dict[str, str] = {}
    for item in matched_entities:
        if not isinstance(item, dict):
            continue
        eid = str(item.get("id", "")).strip()
        alias = str(item.get("matched_alias", "")).strip()
        if eid:
            entity_ids.append(eid)
            if alias:
                matched_aliases[eid] = alias

    return {
        "entity_ids": entity_ids,
        "topics": valid_topics,
        "matched_aliases": matched_aliases,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Narrative metrics
# ---------------------------------------------------------------------------


def _update_narrative_metrics(db: Client, text: str) -> None:
    """
    Count occurrences of narrative terms in text and upsert into narrative_metrics.
    Increments frequency if a row already exists for today.
    """
    today = date.today().isoformat()

    for en_term, zh_term in NARRATIVE_TERMS:
        # Count occurrences (case-insensitive for English)
        frequency = text.lower().count(en_term.lower()) + text.count(zh_term)
        if frequency == 0:
            continue

        try:
            # Check if row exists for this term + date
            existing = (
                db.table("narrative_metrics")
                .select("id, frequency")
                .eq("term", en_term)
                .eq("date", today)
                .execute()
            )
            if existing.data:
                row = existing.data[0]
                new_freq = (row.get("frequency") or 0) + frequency
                db.table("narrative_metrics").update({"frequency": new_freq}).eq(
                    "id", row["id"]
                ).execute()
            else:
                db.table("narrative_metrics").insert(
                    {
                        "term": en_term,
                        "term_zh": zh_term,
                        "date": today,
                        "frequency": frequency,
                    }
                ).execute()
        except Exception as exc:
            logger.error(
                "Failed to update narrative_metrics for term '%s': %s", en_term, exc
            )


# ---------------------------------------------------------------------------
# Single-article tagger
# ---------------------------------------------------------------------------


async def tag_article(article_id: str, db: Client, entities: list[dict] | None = None) -> dict:
    """
    Tag a single article with entities and topics.
    Returns {"entities_matched": N, "topics_matched": N}

    If entities is provided, re-uses that list (avoids extra DB round-trip in batch mode).
    """
    # Fetch article text
    try:
        result = (
            db.table("articles")
            .select("id, raw_text_en")
            .eq("id", article_id)
            .single()
            .execute()
        )
        article = result.data
    except Exception as exc:
        logger.error("Failed to fetch article %s for tagging: %s", article_id, exc)
        return {"entities_matched": 0, "topics_matched": 0}

    if not article:
        logger.warning("Article %s not found", article_id)
        return {"entities_matched": 0, "topics_matched": 0}

    raw_text_en: str | None = article.get("raw_text_en")
    if not raw_text_en:
        logger.debug("Article %s has no raw_text_en — skipping tagging", article_id)
        return {"entities_matched": 0, "topics_matched": 0}

    # Load entities from DB if not provided
    if entities is None:
        try:
            ent_result = db.table("entities").select("*").execute()
            entities = ent_result.data or []
        except Exception as exc:
            logger.error("Failed to fetch entities: %s", exc)
            entities = []

    # Call GPT
    extraction = await _extract_with_gpt(raw_text_en, entities)
    entity_ids: list[str] = extraction["entity_ids"]
    topics: list[str] = extraction["topics"]
    matched_aliases: dict[str, str] = extraction["matched_aliases"]
    summary: str = extraction.get("summary", "")

    # Write summary_en back to the article if we got one
    if summary:
        try:
            db.table("articles").update({"summary_en": summary}).eq("id", article_id).execute()
        except Exception as exc:
            logger.error("Failed to write summary_en for article %s: %s", article_id, exc)

    # Upsert article_entities
    entities_matched = 0
    for eid in entity_ids:
        try:
            db.table("article_entities").upsert(
                {
                    "article_id": article_id,
                    "entity_id": eid,
                    "matched_alias": matched_aliases.get(eid),
                },
                on_conflict="article_id,entity_id",
            ).execute()
            entities_matched += 1
        except Exception as exc:
            logger.error(
                "Failed to upsert article_entity (article=%s, entity=%s): %s",
                article_id,
                eid,
                exc,
            )

    # Upsert article_topics
    topics_matched = 0
    for topic in topics:
        try:
            db.table("article_topics").upsert(
                {"article_id": article_id, "topic": topic},
                on_conflict="article_id,topic",
            ).execute()
            topics_matched += 1
        except Exception as exc:
            logger.error(
                "Failed to upsert article_topic (article=%s, topic=%s): %s",
                article_id,
                topic,
                exc,
            )

    # Update narrative metrics
    _update_narrative_metrics(db, raw_text_en)

    # Evaluate alert rules for newly tagged article
    if entity_ids:
        try:
            from app.services.alert_service import evaluate_article_alerts
            await evaluate_article_alerts(db, article_id, entity_ids, article_text=raw_text_en)
        except Exception as exc:
            logger.warning("Alert evaluation failed for article %s: %s", article_id, exc)

    logger.info(
        "Tagged article %s — entities: %d, topics: %d",
        article_id,
        entities_matched,
        topics_matched,
    )
    return {"entities_matched": entities_matched, "topics_matched": topics_matched}


# ---------------------------------------------------------------------------
# Batch tagger
# ---------------------------------------------------------------------------


async def tag_pending_articles(db: Client) -> dict:
    """
    Find articles with tagging_status='pending' (translation must be done first).
    Tag each one. Marks each article 'done' or 'failed' in tagging_status.
    Returns {"tagged": N, "failed": N}
    """
    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set — skipping batch tagging")
        return {"tagged": 0, "failed": 0}

    # Fetch all entities once
    try:
        ent_result = db.table("entities").select("*").execute()
        entities: list[dict] = ent_result.data or []
    except Exception as exc:
        logger.error("Failed to fetch entities for batch tagging: %s", exc)
        return {"tagged": 0, "failed": 0}

    # Fetch articles ready to tag: translation done, tagging pending
    try:
        articles_result = (
            db.table("articles")
            .select("id")
            .eq("tagging_status", "pending")
            .eq("translation_status", "done")
            .execute()
        )
        pending: list[dict] = articles_result.data or []
    except Exception as exc:
        logger.error("Failed to fetch articles for tagging: %s", exc)
        return {"tagged": 0, "failed": 0}

    if not pending:
        logger.info("No pending articles to tag")
        return {"tagged": 0, "failed": 0}

    logger.info("Tagging %d pending articles", len(pending))

    tagged = 0
    failed = 0

    for article in pending:
        article_id = str(article["id"])
        try:
            await tag_article(article_id, db, entities=entities)
            db.table("articles").update({"tagging_status": "done"}).eq("id", article_id).execute()
            tagged += 1
        except Exception as exc:
            logger.error("Unhandled error tagging article %s: %s", article_id, exc)
            db.table("articles").update({"tagging_status": "failed"}).eq("id", article_id).execute()
            failed += 1

    summary = {"tagged": tagged, "failed": failed}
    logger.info("Tagging batch complete: %s", summary)
    return summary
