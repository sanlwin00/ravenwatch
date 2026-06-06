"""
Seed 2 default analyst users if the users table is empty.
Safe to call multiple times — only seeds when the table has no rows.
"""
from __future__ import annotations

import logging
from supabase import Client

from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

DEFAULT_USERS = [
    {"email": "analyst1@ravenwatch.local", "password": "changeme123"},
    {"email": "analyst2@ravenwatch.local", "password": "changeme123"},
]


async def seed_users(db: Client) -> dict:
    """
    Insert default users only when the users table is empty.
    Returns a summary dict with counts.
    """
    try:
        existing = db.table("users").select("id").limit(1).execute()
        if existing.data:
            logger.info("Users table already has rows — skipping seed.")
            return {"seeded": 0, "skipped": len(DEFAULT_USERS), "reason": "table not empty"}
    except Exception as exc:
        logger.error("Could not check users table: %s", exc)
        return {"seeded": 0, "skipped": 0, "error": str(exc)}

    seeded = 0
    skipped = 0
    for user in DEFAULT_USERS:
        try:
            db.table("users").insert(
                {
                    "email": user["email"],
                    "password_hash": hash_password(user["password"]),
                }
            ).execute()
            logger.info("Seeded user: %s", user["email"])
            seeded += 1
        except Exception as exc:
            logger.error("Failed to seed user %s: %s", user["email"], exc)
            skipped += 1

    return {"seeded": seeded, "skipped": skipped}
