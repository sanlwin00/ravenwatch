from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class AlertLog(BaseModel):
    id: UUID
    article_id: Optional[UUID] = None
    priority: str
    channel: str
    sent_at: datetime
