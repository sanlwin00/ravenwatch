from __future__ import annotations
from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel


class Entity(BaseModel):
    id: UUID
    name: str
    name_zh: Optional[str] = None
    aliases: list[Any] = []
    type: str
    tier: Optional[int] = 2
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime


class EntityCreate(BaseModel):
    name: str
    name_zh: Optional[str] = None
    aliases: list[Any] = []
    type: str
    tier: Optional[int] = 2
    notes: Optional[str] = None
    created_by: Optional[str] = None


class EntityUpdate(BaseModel):
    name: Optional[str] = None
    name_zh: Optional[str] = None
    aliases: Optional[list[Any]] = None
    type: Optional[str] = None
    tier: Optional[int] = None
    notes: Optional[str] = None
