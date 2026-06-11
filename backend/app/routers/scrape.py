from fastapi import APIRouter, BackgroundTasks, Depends
from supabase import Client

from app.db import get_db
from app.dependencies import get_current_user, require_scrape_auth
from app.services.scraper import scrape_all_sources
from app.services.tagger import tag_pending_articles

router = APIRouter(prefix="/scrape", tags=["scrape"])


async def _run_scrape(db: Client) -> None:
    """Background task wrapper — exceptions are logged inside scrape_all_sources."""
    await scrape_all_sources(db)


@router.post("", dependencies=[Depends(require_scrape_auth)])
async def trigger_scrape(
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_db),
):
    """
    Trigger a full scrape of all active sources in the background.
    Returns immediately with a 202-style acknowledgement.
    """
    # Count active sources for the response message
    try:
        result = db.table("sources").select("id", count="exact").eq("active", True).execute()
        source_count = result.count or 0
    except Exception:
        source_count = 0

    background_tasks.add_task(_run_scrape, db)

    return {
        "status": "started",
        "message": f"Scrape initiated for {source_count} sources",
    }


@router.post("/tag", dependencies=[Depends(get_current_user)])
async def trigger_tag(
    db: Client = Depends(get_db),
):
    """
    Manually trigger tagging of all pending articles with entities and topics.
    Protected: requires a valid Bearer token.
    """
    result = await tag_pending_articles(db)
    return result
