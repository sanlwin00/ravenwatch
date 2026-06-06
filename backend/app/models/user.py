from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr


class User(BaseModel):
    id: UUID
    email: str
    telegram_chat_id: Optional[str] = None
    push_subscription: Optional[Any] = None
    created_at: datetime


class UserCreate(BaseModel):
    email: str
    password: str
    telegram_chat_id: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str
