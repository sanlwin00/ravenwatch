from __future__ import annotations
from datetime import date
from uuid import UUID
from pydantic import BaseModel


class NarrativeMetric(BaseModel):
    id: UUID
    term: str
    term_zh: str
    date: date
    frequency: int = 0
