from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.db import get_db
from app.services.sources_seed import seed_sources

router = APIRouter(prefix="/sources", tags=["sources"])


class SourceUpdate(BaseModel):
    url: str
    active: bool | None = None


@router.get("")
def list_sources(db: Client = Depends(get_db)):
    result = db.table("sources").select("*").order("name").execute()
    return result.data or []


@router.put("/{source_id}")
def update_source(source_id: str, body: SourceUpdate, db: Client = Depends(get_db)):
    update: dict = {"url": body.url.strip()}
    if body.active is not None:
        update["active"] = body.active
    result = db.table("sources").update(update).eq("id", source_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Source not found")
    return result.data[0]


@router.post("/seed")
def seed_sources_endpoint(db: Client = Depends(get_db)):
    try:
        return seed_sources(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
