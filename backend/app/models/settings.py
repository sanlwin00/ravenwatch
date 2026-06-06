from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, field_validator


class PlatformSettings(BaseModel):
    id: UUID
    key: str
    value: str
    updated_by: Optional[str] = None
    updated_at: datetime


class PlatformSettingsUpdate(BaseModel):
    value: str
    updated_by: Optional[str] = None


class SettingsUpdate(BaseModel):
    retention_days: Optional[int] = None  # 7–365
    scraper_frequency_hours: Optional[int] = None

    @field_validator("retention_days")
    @classmethod
    def validate_retention(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (7 <= v <= 365):
            raise ValueError("retention_days must be between 7 and 365")
        return v
