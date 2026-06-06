from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.db import get_db
from app.models.settings import SettingsUpdate
from app.services import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=dict)
async def get_settings(db: Client = Depends(get_db)):
    """Returns all settings as a flat {key: value} dict."""
    return await settings_service.get_all_settings(db)


@router.put("", response_model=dict)
async def update_settings(
    payload: SettingsUpdate,
    db: Client = Depends(get_db),
):
    """Update one or more settings. All values are stored as strings."""
    updates: dict[str, str] = {}

    if payload.retention_days is not None:
        updates["retention_days"] = str(payload.retention_days)

    if payload.scraper_frequency_hours is not None:
        updates["scraper_frequency_hours"] = str(payload.scraper_frequency_hours)

    if not updates:
        raise HTTPException(status_code=422, detail="No valid fields provided.")

    return await settings_service.update_settings(db, updates)


@router.get("/{key}")
async def get_setting(key: str, db: Client = Depends(get_db)):
    """Returns the value for a single setting key."""
    value = await settings_service.get_setting(db, key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found.")
    return {"key": key, "value": value}
