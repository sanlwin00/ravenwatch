from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_db
from app.dependencies import get_current_user
from app.models.user import UserLogin
from app.services.auth_service import authenticate_user, create_access_token
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


@router.post("/seed-users")
async def seed_users_endpoint(db=Depends(get_db)):
    """
    Idempotent: seeds 2 default analyst users only if the users table is empty.
    No authentication required.
    """
    result = await seed_users(db)
    return result
