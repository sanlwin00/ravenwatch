from __future__ import annotations

import asyncio

from supabase import Client

# Fields needed for the article list view — excludes large text blobs
LIST_COLUMNS = "id, source_id, title, title_en, url, published_at, scraped_at, language_original, is_early_signal, is_policy_signal"


def _build_base_query(db: Client):
    """Return a base articles query — expired articles hidden unless tagged/matched."""
    return db.table("articles").select(LIST_COLUMNS).or_("expires_at.is.null,expires_at.gt.now()")


async def _get_article_ids_with_entity_country(db: Client, country: str) -> set[str]:
    ent_res = db.table("entities").select("id").eq("country", country).execute()
    entity_ids = [row["id"] for row in (ent_res.data or [])]
    if not entity_ids:
        return set()
    ae_res = db.table("article_entities").select("article_id").in_("entity_id", entity_ids).execute()
    return {row["article_id"] for row in (ae_res.data or [])}


async def _get_source_ids_by_origin(db: Client, origin: str) -> set[str]:
    if origin == "china":
        types = ["official", "yunnan", "thinktank"]
    elif origin == "myanmar":
        types = ["myanmar"]
    else:
        return set()
    res = db.table("sources").select("id").in_("type", types).execute()
    return {row["id"] for row in (res.data or [])}


def _apply_filters(query, source_id, from_date, to_date):
    """Apply simple column filters to a query — entity/topic filtering done separately."""
    if source_id:
        query = query.eq("source_id", source_id)
    if from_date:
        # Use published_at when available; Supabase doesn't support conditional column
        # selection so we filter on scraped_at as the fallback universal timestamp.
        query = query.gte("scraped_at", from_date)
    if to_date:
        query = query.lte("scraped_at", to_date)
    return query


async def _get_article_ids_with_entities(db: Client, tier: int | None = None) -> set[str]:
    """Return article IDs that have at least one tagged entity, optionally filtered by tier."""
    if tier is not None:
        ent_res = db.table("entities").select("id").eq("tier", tier).execute()
        entity_ids = [row["id"] for row in (ent_res.data or [])]
        if not entity_ids:
            return set()
        ae_res = (
            db.table("article_entities")
            .select("article_id")
            .in_("entity_id", entity_ids)
            .execute()
        )
    else:
        ae_res = db.table("article_entities").select("article_id").execute()
    return {row["article_id"] for row in (ae_res.data or [])}


async def _get_article_ids_for_entity(db: Client, entity_id: str) -> set[str]:
    res = (
        db.table("article_entities")
        .select("article_id")
        .eq("entity_id", entity_id)
        .execute()
    )
    return {row["article_id"] for row in (res.data or [])}


async def _get_article_ids_for_topic(db: Client, topic: str) -> set[str]:
    res = (
        db.table("article_topics")
        .select("article_id")
        .eq("topic", topic)
        .execute()
    )
    return {row["article_id"] for row in (res.data or [])}


async def _enrich_articles(db: Client, articles: list[dict]) -> list[dict]:
    """Add source_name, entity_tags, and topic_tags to each article in a batch."""
    if not articles:
        return articles

    article_ids = [a["id"] for a in articles]
    source_ids = list({a["source_id"] for a in articles if a.get("source_id")})

    # Fetch sources
    source_map: dict[str, str] = {}
    if source_ids:
        src_res = (
            db.table("sources")
            .select("id, name")
            .in_("id", source_ids)
            .execute()
        )
        source_map = {row["id"]: row["name"] for row in (src_res.data or [])}

    # Fetch article_entities with entity details
    entity_rows_res = (
        db.table("article_entities")
        .select("article_id, entity_id")
        .in_("article_id", article_ids)
        .execute()
    )
    entity_rows = entity_rows_res.data or []

    entity_ids = list({row["entity_id"] for row in entity_rows})
    entity_detail_map: dict[str, dict] = {}
    if entity_ids:
        ent_res = (
            db.table("entities")
            .select("id, name, name_zh, tier")
            .in_("id", entity_ids)
            .execute()
        )
        entity_detail_map = {row["id"]: row for row in (ent_res.data or [])}

    # Build article_id -> entity_tags map
    article_entity_map: dict[str, list[dict]] = {aid: [] for aid in article_ids}
    for row in entity_rows:
        detail = entity_detail_map.get(row["entity_id"])
        if detail:
            article_entity_map[row["article_id"]].append(detail)

    # Fetch article_topics
    topic_res = (
        db.table("article_topics")
        .select("article_id, topic")
        .in_("article_id", article_ids)
        .execute()
    )
    article_topic_map: dict[str, list[str]] = {aid: [] for aid in article_ids}
    for row in (topic_res.data or []):
        article_topic_map[row["article_id"]].append(row["topic"])

    # Merge enrichment into articles using field names the frontend expects
    for article in articles:
        aid = article["id"]
        src_id = article.get("source_id")
        article["source"] = {"id": src_id, "name": source_map.get(src_id)} if src_id else None
        article["entities"] = article_entity_map.get(aid, [])
        article["topics"] = article_topic_map.get(aid, [])

    return articles


async def resolve_filter_ids(
    db: Client,
    entity_id: str | None = None,
    topic: str | None = None,
    tier: int | None = None,
    has_entities: bool = False,
) -> set[str] | None:
    """Compute the set of article IDs that satisfy join-based filters. Returns None if no filter applies."""
    filter_ids: set[str] | None = None

    if has_entities or tier is not None:
        ids = await _get_article_ids_with_entities(db, tier)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    if entity_id:
        ids = await _get_article_ids_for_entity(db, entity_id)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    if topic:
        ids = await _get_article_ids_for_topic(db, topic)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    return filter_ids


async def get_articles(
    db: Client,
    source_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    filter_ids: set[str] | None = None,
    source_origin: str | None = None,
) -> list[dict]:
    """Query articles with optional filters. Returns enriched article dicts."""

    # If filters produced no IDs, return early
    if filter_ids is not None and not filter_ids:
        return []

    # Resolve source IDs + opposite-country entity article IDs for origin filter
    origin_source_ids: set[str] | None = None
    entity_country_ids: set[str] | None = None
    if source_origin:
        origin_source_ids = await _get_source_ids_by_origin(db, source_origin)
        if not origin_source_ids:
            return []
        # Also intersect with articles that have entities from the opposite country
        opposite = "MM" if source_origin == "china" else "CN"
        entity_country_ids = await _get_article_ids_with_entity_country(db, opposite)
        # If no entities tagged yet, don't filter by entity country (graceful degradation)
        if not entity_country_ids:
            entity_country_ids = None

    if search:
        # Title search
        title_q = _build_base_query(db)
        title_q = _apply_filters(title_q, source_id, from_date, to_date)
        title_q = title_q.ilike("title", f"%{search}%")
        if filter_ids is not None:
            title_q = title_q.in_("id", list(filter_ids))
        if origin_source_ids is not None:
            title_q = title_q.in_("source_id", list(origin_source_ids))
        if entity_country_ids is not None:
            title_q = title_q.in_("id", list(entity_country_ids))
        title_res = title_q.execute()
        title_rows = title_res.data or []

        # Body search
        body_q = _build_base_query(db)
        body_q = _apply_filters(body_q, source_id, from_date, to_date)
        body_q = body_q.ilike("raw_text_en", f"%{search}%")
        if filter_ids is not None:
            body_q = body_q.in_("id", list(filter_ids))
        if origin_source_ids is not None:
            body_q = body_q.in_("source_id", list(origin_source_ids))
        if entity_country_ids is not None:
            body_q = body_q.in_("id", list(entity_country_ids))
        body_res = body_q.execute()
        body_rows = body_res.data or []

        # Deduplicate by id, preserving order (title matches first)
        seen: set[str] = set()
        merged: list[dict] = []
        for row in title_rows + body_rows:
            if row["id"] not in seen:
                seen.add(row["id"])
                merged.append(row)

        # Sort by published_at DESC (nulls last), fall back to scraped_at
        merged.sort(key=lambda r: (r.get("published_at") or r.get("scraped_at") or ""), reverse=True)
        page = merged[offset: offset + limit]
        return await _enrich_articles(db, page)

    # Standard (non-search) path
    query = _build_base_query(db)
    query = _apply_filters(query, source_id, from_date, to_date)
    if filter_ids is not None:
        query = query.in_("id", list(filter_ids))
    if origin_source_ids is not None:
        query = query.in_("source_id", list(origin_source_ids))
    if entity_country_ids is not None:
        query = query.in_("id", list(entity_country_ids))

    # Primary DB sort by scraped_at (always set) for correct cross-page ordering.
    # Re-sort in Python by effective date (published_at ?? scraped_at) for correct
    # within-page order when published_at is present on some articles but not others.
    query = query.order("scraped_at", desc=True).range(offset, offset + limit - 1)
    res = query.execute()
    rows = res.data or []
    rows.sort(key=lambda r: (r.get("published_at") or r.get("scraped_at") or ""), reverse=True)
    return await _enrich_articles(db, rows)


async def get_article(db: Client, article_id: str) -> dict | None:
    """Get a single article by ID, enriched. Returns None if not found or expired."""
    res = (
        db.table("articles").select("*").or_("expires_at.is.null,expires_at.gt.now()")
        .eq("id", article_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return None
    enriched = await _enrich_articles(db, [res.data])
    return enriched[0] if enriched else None


async def get_article_count(
    db: Client,
    source_id: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
    filter_ids: set[str] | None = None,
    source_origin: str | None = None,
) -> int:
    """Return total article count matching the given filters (for pagination)."""

    if filter_ids is not None and not filter_ids:
        return 0

    origin_source_ids: set[str] | None = None
    entity_country_ids: set[str] | None = None
    if source_origin:
        origin_source_ids = await _get_source_ids_by_origin(db, source_origin)
        if not origin_source_ids:
            return 0
        opposite = "MM" if source_origin == "china" else "CN"
        entity_country_ids = await _get_article_ids_with_entity_country(db, opposite)
        if not entity_country_ids:
            entity_country_ids = None

    if search:
        # Must materialise results to count after dedup (same logic as get_articles)
        title_q = db.table("articles").select("id").or_("expires_at.is.null,expires_at.gt.now()")
        title_q = _apply_filters(title_q, source_id, from_date, to_date)
        title_q = title_q.ilike("title", f"%{search}%")
        if filter_ids is not None:
            title_q = title_q.in_("id", list(filter_ids))
        if origin_source_ids is not None:
            title_q = title_q.in_("source_id", list(origin_source_ids))
        if entity_country_ids is not None:
            title_q = title_q.in_("id", list(entity_country_ids))
        title_res = title_q.execute()

        body_q = db.table("articles").select("id").or_("expires_at.is.null,expires_at.gt.now()")
        body_q = _apply_filters(body_q, source_id, from_date, to_date)
        body_q = body_q.ilike("raw_text_en", f"%{search}%")
        if filter_ids is not None:
            body_q = body_q.in_("id", list(filter_ids))
        if origin_source_ids is not None:
            body_q = body_q.in_("source_id", list(origin_source_ids))
        if entity_country_ids is not None:
            body_q = body_q.in_("id", list(entity_country_ids))
        body_res = body_q.execute()

        all_ids = {row["id"] for row in (title_res.data or []) + (body_res.data or [])}
        return len(all_ids)

    query = db.table("articles").select("id", count="exact").or_("expires_at.is.null,expires_at.gt.now()")
    query = _apply_filters(query, source_id, from_date, to_date)
    if filter_ids is not None:
        query = query.in_("id", list(filter_ids))
    if origin_source_ids is not None:
        query = query.in_("source_id", list(origin_source_ids))
    if entity_country_ids is not None:
        query = query.in_("id", list(entity_country_ids))

    res = query.execute()
    return res.count or 0
