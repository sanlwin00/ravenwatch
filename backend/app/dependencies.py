"""
FastAPI dependencies — reusable injection targets for protected routes.
"""
from __future__ import annotations

import os

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.db import get_db
from app.services.auth_service import decode_token, get_user_by_email

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db=Depends(get_db),
) -> dict:
    """Raises 401 if token is missing, expired, or invalid."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    email: str | None = payload.get("sub")
    if not email:
        raise credentials_exception

    user = await get_user_by_email(db, email)
    if user is None:
        raise credentials_exception

    return user


async def require_scrape_auth(
    x_api_key: str | None = Header(default=None),
    token: str | None = Depends(oauth2_scheme),
    db=Depends(get_db),
) -> None:
    """
    Accepts either:
    - A valid Bearer token (frontend user sessions), or
    - X-API-Key header matching SCRAPE_API_KEY env var (external schedulers).
    """
    # Check API key first (Donut Core / external callers)
    api_key = os.environ.get("SCRAPE_API_KEY", "")
    if api_key and x_api_key == api_key:
        return

    # Fall back to Bearer token
    if token:
        payload = decode_token(token)
        if payload and payload.get("sub"):
            user = await get_user_by_email(db, payload["sub"])
            if user:
                return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
