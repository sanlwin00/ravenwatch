"""
RavenWatch export service — article CSV generation.
"""
from __future__ import annotations

import logging
from io import StringIO

import csv

from supabase import Client

logger = logging.getLogger(__name__)

EXPORT_LIMIT = 1000


async def export_articles_csv(
    db: Client,
    entity_id: str | None = None,
    source_id: str | None = None,
    topic: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
) -> str:
    """
    Fetch filtered articles and format as a CSV string using pandas.

    Columns: title, source_name, published_at, url, entities, topics, summary_en

    - entities: comma-joined entity names e.g. "Deng Xijun, MNDAA"
    - topics: comma-joined topic strings e.g. "ceasefire, mediation"
    - published_at: ISO format date string

    Returns: CSV string
    """
    # Build base query — join source name and pull entity/topic data separately
    query = (
        db.table("articles")
        .select("id, title, url, published_at, summary_en, sources(name)")
        .order("published_at", desc=True)
        .limit(EXPORT_LIMIT)
    )

    if from_date:
        query = query.gte("published_at", from_date)
    if to_date:
        # Include articles up to and including to_date (end of day)
        query = query.lte("published_at", f"{to_date}T23:59:59")
    if source_id:
        query = query.eq("source_id", source_id)
    if search:
        query = query.ilike("title", f"%{search}%")

    try:
        result = query.execute()
        articles: list[dict] = result.data or []
    except Exception as exc:
        logger.error("Failed to fetch articles for CSV export: %s", exc)
        return ""

    if not articles:
        # Return CSV with headers only
        return "title,source_name,published_at,url,entities,topics,summary_en\n"

    article_ids = [str(a["id"]) for a in articles]

    # Fetch entity associations for these articles
    entity_map: dict[str, list[str]] = {}
    try:
        ae_result = (
            db.table("article_entities")
            .select("article_id, entities(name)")
            .in_("article_id", article_ids)
            .execute()
        )
        for row in ae_result.data or []:
            aid = str(row["article_id"])
            entity_name = (row.get("entities") or {}).get("name", "")
            if entity_name:
                entity_map.setdefault(aid, []).append(entity_name)
    except Exception as exc:
        logger.warning("Failed to fetch entity associations for export: %s", exc)

    # Filter by entity_id if requested (post-filter since Supabase nested filtering is limited)
    if entity_id:
        try:
            ae_filter_result = (
                db.table("article_entities")
                .select("article_id")
                .eq("entity_id", entity_id)
                .in_("article_id", article_ids)
                .execute()
            )
            matching_ids = {str(r["article_id"]) for r in ae_filter_result.data or []}
            articles = [a for a in articles if str(a["id"]) in matching_ids]
        except Exception as exc:
            logger.warning("Failed to filter by entity_id for export: %s", exc)

    # Fetch topic associations for these articles
    topic_map: dict[str, list[str]] = {}
    try:
        at_result = (
            db.table("article_topics")
            .select("article_id, topic")
            .in_("article_id", article_ids)
            .execute()
        )
        for row in at_result.data or []:
            aid = str(row["article_id"])
            t = row.get("topic", "")
            if t:
                topic_map.setdefault(aid, []).append(t)
    except Exception as exc:
        logger.warning("Failed to fetch topic associations for export: %s", exc)

    # Filter by topic if requested
    if topic:
        articles = [a for a in articles if topic in topic_map.get(str(a["id"]), [])]

    # Build rows
    rows = []
    for article in articles:
        aid = str(article["id"])
        source_name = ""
        sources_data = article.get("sources")
        if isinstance(sources_data, dict):
            source_name = sources_data.get("name", "")
        elif isinstance(sources_data, list) and sources_data:
            source_name = sources_data[0].get("name", "")

        published_at = article.get("published_at") or ""
        if published_at and "T" in published_at:
            # Normalize to ISO date string (keep full ISO if time is relevant)
            published_at = published_at.replace("Z", "+00:00")

        rows.append({
            "title": article.get("title") or "",
            "source_name": source_name,
            "published_at": published_at,
            "url": article.get("url") or "",
            "entities": ", ".join(entity_map.get(aid, [])),
            "topics": ", ".join(topic_map.get(aid, [])),
            "summary_en": article.get("summary_en") or "",
        })

    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["title", "source_name", "published_at", "url", "entities", "topics", "summary_en"])
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()
