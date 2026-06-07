from __future__ import annotations

from supabase import Client


def _build_base_query(db: Client):
    """Return a base articles query with expiry filter applied."""
    return db.table("articles").select("*").gt("expires_at", "now()")


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


async def get_articles(
    db: Client,
    entity_id: str | None = None,
    source_id: str | None = None,
    topic: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Query articles with optional filters. Returns enriched article dicts."""

    # Resolve join-based ID sets before main query
    filter_ids: set[str] | None = None

    if entity_id:
        ids = await _get_article_ids_for_entity(db, entity_id)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    if topic:
        ids = await _get_article_ids_for_topic(db, topic)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    # If filters produced no IDs, return early
    if filter_ids is not None and not filter_ids:
        return []

    if search:
        # Title search
        title_q = _build_base_query(db)
        title_q = _apply_filters(title_q, source_id, from_date, to_date)
        title_q = title_q.ilike("title", f"%{search}%")
        if filter_ids is not None:
            title_q = title_q.in_("id", list(filter_ids))
        title_res = title_q.execute()
        title_rows = title_res.data or []

        # Body search
        body_q = _build_base_query(db)
        body_q = _apply_filters(body_q, source_id, from_date, to_date)
        body_q = body_q.ilike("raw_text_en", f"%{search}%")
        if filter_ids is not None:
            body_q = body_q.in_("id", list(filter_ids))
        body_res = body_q.execute()
        body_rows = body_res.data or []

        # Deduplicate by id, preserving order (title matches first)
        seen: set[str] = set()
        merged: list[dict] = []
        for row in title_rows + body_rows:
            if row["id"] not in seen:
                seen.add(row["id"])
                merged.append(row)

        # Sort merged by scraped_at DESC, then paginate manually
        merged.sort(key=lambda r: r.get("scraped_at") or "", reverse=True)
        page = merged[offset: offset + limit]
        return await _enrich_articles(db, page)

    # Standard (non-search) path
    query = _build_base_query(db)
    query = _apply_filters(query, source_id, from_date, to_date)
    if filter_ids is not None:
        query = query.in_("id", list(filter_ids))

    query = query.order("scraped_at", desc=True).range(offset, offset + limit - 1)
    res = query.execute()
    rows = res.data or []
    return await _enrich_articles(db, rows)


async def get_article(db: Client, article_id: str) -> dict | None:
    """Get a single article by ID, enriched. Returns None if not found or expired."""
    res = (
        _build_base_query(db)
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
    entity_id: str | None = None,
    source_id: str | None = None,
    topic: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
) -> int:
    """Return total article count matching the given filters (for pagination)."""

    filter_ids: set[str] | None = None

    if entity_id:
        ids = await _get_article_ids_for_entity(db, entity_id)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    if topic:
        ids = await _get_article_ids_for_topic(db, topic)
        filter_ids = ids if filter_ids is None else filter_ids & ids

    if filter_ids is not None and not filter_ids:
        return 0

    if search:
        # Must materialise results to count after dedup (same logic as get_articles)
        title_q = _build_base_query(db)
        title_q = _apply_filters(title_q, source_id, from_date, to_date)
        title_q = title_q.ilike("title", f"%{search}%").select("id")
        if filter_ids is not None:
            title_q = title_q.in_("id", list(filter_ids))
        title_res = title_q.execute()

        body_q = _build_base_query(db)
        body_q = _apply_filters(body_q, source_id, from_date, to_date)
        body_q = body_q.ilike("raw_text_en", f"%{search}%").select("id")
        if filter_ids is not None:
            body_q = body_q.in_("id", list(filter_ids))
        body_res = body_q.execute()

        all_ids = {row["id"] for row in (title_res.data or []) + (body_res.data or [])}
        return len(all_ids)

    query = db.table("articles").select("id", count="exact").gt("expires_at", "now()")
    query = _apply_filters(query, source_id, from_date, to_date)
    if filter_ids is not None:
        query = query.in_("id", list(filter_ids))

    res = query.execute()
    return res.count or 0
