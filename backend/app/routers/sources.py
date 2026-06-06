from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.db import get_db
from app.services.sources_seed import seed_sources

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
def list_sources(db: Client = Depends(get_db)):
    """Return all sources from the database, ordered by name."""
    try:
        result = db.table("sources").select("*").order("name").execute()
        return result.data or []
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/seed")
def seed_sources_endpoint(db: Client = Depends(get_db)):
    """Seed the default source list. Safe to call multiple times — skips existing URLs."""
    try:
        return seed_sources(db)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
