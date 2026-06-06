from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, HttpUrl


class Source(BaseModel):
    id: UUID
    name: str
    url: str
    language: str = "zh"
    type: str
    active: bool = True
    last_scraped_at: Optional[datetime] = None


class SourceCreate(BaseModel):
    name: str
    url: str
    language: str = "zh"
    type: str
    active: bool = True
