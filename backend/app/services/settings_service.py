from supabase import Client

TABLE = "platform_settings"


async def get_all_settings(db: Client) -> dict:
    """Returns all settings as {key: value} dict."""
    result = db.table(TABLE).select("key, value").execute()
    return {row["key"]: row["value"] for row in result.data}


async def get_setting(db: Client, key: str) -> str | None:
    """Returns value for a single key, or None if not found."""
    result = db.table(TABLE).select("value").eq("key", key).execute()
    if not result.data:
        return None
    return result.data[0]["value"]


async def update_setting(
    db: Client, key: str, value: str, updated_by: str = "system"
) -> dict:
    """Upserts a setting. Returns the updated row."""
    result = (
        db.table(TABLE)
        .upsert({"key": key, "value": value, "updated_by": updated_by}, on_conflict="key")
        .execute()
    )
    return result.data[0]


async def update_settings(
    db: Client, updates: dict, updated_by: str = "system"
) -> dict:
    """Update multiple settings at once. Returns updated {key: value} dict."""
    rows = [
        {"key": k, "value": v, "updated_by": updated_by}
        for k, v in updates.items()
    ]
    db.table(TABLE).upsert(rows, on_conflict="key").execute()
    return await get_all_settings(db)


async def get_retention_days(db: Client) -> int:
    """Convenience: returns retention_days as int, default 30."""
    value = await get_setting(db, "retention_days")
    try:
        return int(value) if value is not None else 30
    except (ValueError, TypeError):
        return 30


async def get_scraper_frequency_hours(db: Client) -> int:
    """Convenience: returns scraper_frequency_hours as int, default 24."""
    value = await get_setting(db, "scraper_frequency_hours")
    try:
        return int(value) if value is not None else 24
    except (ValueError, TypeError):
        return 24
