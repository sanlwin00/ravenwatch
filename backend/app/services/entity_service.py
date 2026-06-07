from __future__ import annotations

from supabase import Client

from app.services.entity_seed import seed_entities as _seed_entities


async def get_all_entities(db: Client) -> list[dict]:
    """Return all entities sorted by tier ascending, then name ascending."""
    res = (
        db.table("entities")
        .select("*")
        .order("tier", desc=False)
        .order("name", desc=False)
        .execute()
    )
    return res.data or []


async def get_entity(db: Client, entity_id: str) -> dict | None:
    """Return a single entity by ID, or None if not found."""
    res = (
        db.table("entities")
        .select("*")
        .eq("id", entity_id)
        .maybe_single()
        .execute()
    )
    return res.data


async def create_entity(db: Client, data: dict) -> dict:
    """Insert a new entity and return the created row."""
    res = db.table("entities").insert(data).execute()
    return res.data[0]


async def update_entity(db: Client, entity_id: str, data: dict) -> dict | None:
    """Update an entity by ID. Returns the updated row, or None if not found."""
    # Strip None values so unset optional fields are not overwritten.
    payload = {k: v for k, v in data.items() if v is not None}
    if not payload:
        # Nothing to update — return the current record.
        return await get_entity(db, entity_id)

    res = (
        db.table("entities")
        .update(payload)
        .eq("id", entity_id)
        .execute()
    )
    if not res.data:
        return None
    return res.data[0]


async def delete_entity(db: Client, entity_id: str) -> bool:
    """Delete an entity by ID. Returns True if a row was deleted, False otherwise."""
    res = db.table("entities").delete().eq("id", entity_id).execute()
    return bool(res.data)


async def seed_entities(db: Client) -> int:
    """Seed the default watchlist. Delegates to entity_seed module."""
    return await _seed_entities(db)
