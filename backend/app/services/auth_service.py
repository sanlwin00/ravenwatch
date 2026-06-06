"""
Authentication service: password hashing, JWT creation/decoding, user lookup.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from supabase import Client

logger = logging.getLogger(__name__)

SECRET_KEY: str = os.environ.get("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_user_by_email(db: Client, email: str) -> dict | None:
    try:
        result = (
            db.table("users")
            .select("id, email, password_hash, telegram_chat_id, created_at")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
        return None
    except Exception as exc:
        logger.error("get_user_by_email failed: %s", exc)
        return None


async def authenticate_user(db: Client, email: str, password: str) -> dict | None:
    user = await get_user_by_email(db, email)
    if not user:
        return None
    if not verify_password(password, user.get("password_hash", "")):
        return None
    return user
