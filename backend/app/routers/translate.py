from fastapi import APIRouter, Depends
from supabase import Client

from app.db import get_db
from app.services.translator import translate_pending_articles

router = APIRouter(prefix="/translate", tags=["translate"])


@router.post("")
async def trigger_translation(db: Client = Depends(get_db)):
    """
    Manually trigger translation of all pending articles
    (raw_text_en IS NULL and raw_text_original IS NOT NULL).
    Returns a count of translated, failed, and skipped articles.
    """
    result = await translate_pending_articles(db)
    return result
