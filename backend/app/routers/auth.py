from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.dependencies import get_current_user
from pydantic import BaseModel

from app.models.user import UserLogin
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    get_user_by_email,
    hash_password,
    verify_password,
)
from app.services.user_seed import seed_users

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(body: UserLogin, db=Depends(get_db)):
    user = await authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"email": user["email"]},
    }


@router.post("/logout")
def logout():
    # Stateless JWT: client is responsible for discarding the token.
    return {"message": "logged out"}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"], "id": str(current_user.get("id", ""))}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")
    user = await get_user_by_email(db, current_user["email"])
    if not user or not verify_password(body.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    db.table("users").update({"password_hash": hash_password(body.new_password)}).eq("id", user["id"]).execute()
    return {"message": "Password updated."}


@router.post("/seed-users")
async def seed_users_endpoint(db=Depends(get_db)):
    """
    Idempotent: seeds 2 default analyst users only if the users table is empty.
    No authentication required.
    """
    result = await seed_users(db)
    return result
