from fastapi import APIRouter, Depends
from supabase import Client

from app.db import get_db
from app.services.translator import translate_pending_articles
from app.services.tagger import tag_pending_articles

router = APIRouter(prefix="/translate", tags=["translate"])


@router.post("")
async def trigger_translation(db: Client = Depends(get_db)):
    """
    Manually trigger translation then tagging of all pending articles.
    Returns combined counts for both steps.
    """
    translation = await translate_pending_articles(db)
    tagging = await tag_pending_articles(db)
    return {**translation, **tagging}
