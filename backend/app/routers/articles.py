from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client

from app.db import get_db
from app.services.article_service import get_articles, get_article, get_article_count, resolve_filter_ids

router = APIRouter(prefix="/articles", tags=["articles"])


@router.get("")
async def list_articles(
    entity_id: Optional[str] = Query(default=None),
    source_id: Optional[str] = Query(default=None),
    topic: Optional[str] = Query(default=None),
    tier: Optional[int] = Query(default=None, description="Filter by entity tier: 1=Critical, 2=High, 3=Medium"),
    has_entities: bool = Query(default=False, description="Only return articles with tagged entities"),
    from_date: Optional[str] = Query(default=None, description="ISO date string, e.g. 2024-01-01"),
    to_date: Optional[str] = Query(default=None, description="ISO date string, e.g. 2024-12-31"),
    search: Optional[str] = Query(default=None, description="Full-text search on title and body"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Client = Depends(get_db),
):
    # Resolve join-based filter IDs once and share between articles + count queries
    filter_ids = await resolve_filter_ids(db, entity_id=entity_id, topic=topic, tier=tier, has_entities=has_entities)

    articles, total = await asyncio.gather(
        get_articles(
            db,
            source_id=source_id,
            from_date=from_date,
            to_date=to_date,
            search=search,
            limit=limit,
            offset=offset,
            filter_ids=filter_ids,
        ),
        get_article_count(
            db,
            source_id=source_id,
            from_date=from_date,
            to_date=to_date,
            search=search,
            filter_ids=filter_ids,
        ),
    )
    return {"articles": articles, "total": total, "limit": limit, "offset": offset}


@router.get("/{article_id}")
async def get_article_by_id(
    article_id: str,
    db: Client = Depends(get_db),
):
    article = await get_article(db, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found or expired")
    return article


@router.delete("/{article_id}", status_code=204)
async def delete_article(
    article_id: str,
    db: Client = Depends(get_db),
):
    result = db.table("articles").delete().eq("id", article_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Article not found")
