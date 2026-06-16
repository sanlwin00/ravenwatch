from fastapi import APIRouter, Depends
from supabase import Client

from app.db import get_db

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


@router.get("/status")
async def get_pipeline_status(db: Client = Depends(get_db)):
    """Returns pending/failed counts for translation and tagging queues."""
    def count(table: str, filters: dict) -> int:
        try:
            q = db.table(table).select("id", count="exact")
            for col, val in filters.items():
                q = q.eq(col, val)
            return q.execute().count or 0
        except Exception:
            return -1

    return {
        "translation": {
            "pending": count("articles", {"translation_status": "pending"}),
            "failed": count("articles", {"translation_status": "failed"}),
        },
        "tagging": {
            "pending": count("articles", {"tagging_status": "pending"}),
            "failed": count("articles", {"tagging_status": "failed"}),
        },
    }


@router.post("/retry-failed")
async def retry_failed(db: Client = Depends(get_db)):
    """Reset all failed articles back to pending so they re-queue on next run."""
    try:
        t = db.table("articles").update({"translation_status": "pending"}).eq("translation_status", "failed").execute()
        translation_reset = len(t.data or [])
    except Exception:
        translation_reset = -1

    try:
        g = db.table("articles").update({"tagging_status": "pending"}).eq("tagging_status", "failed").execute()
        tagging_reset = len(g.data or [])
    except Exception:
        tagging_reset = -1

    return {"translation_reset": translation_reset, "tagging_reset": tagging_reset}
