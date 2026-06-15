from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.db import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    priority: str | None = Query(default=None, description="Filter by priority: critical, high, standard"),
    db: Client = Depends(get_db),
):
    """Returns recent alert log entries, newest first."""
    query = db.table("alert_log").select("*").order("sent_at", desc=True)
    if priority:
        query = query.eq("priority", priority)
    query = query.range(offset, offset + limit - 1)
    res = query.execute()
    return res.data or []
