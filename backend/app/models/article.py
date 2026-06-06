from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class Article(BaseModel):
    id: UUID
    source_id: Optional[UUID] = None
    title: Optional[str] = None
    url: str
    published_at: Optional[datetime] = None
    raw_text_en: Optional[str] = None
    raw_text_original: Optional[str] = None
    language_original: Optional[str] = "zh"
    scraped_at: datetime
    expires_at: datetime
    is_early_signal: bool = False
    is_policy_signal: bool = False
    summary_en: Optional[str] = None


class ArticleEntity(BaseModel):
    id: UUID
    article_id: UUID
    entity_id: UUID
    matched_alias: Optional[str] = None


class ArticleTopic(BaseModel):
    id: UUID
    article_id: UUID
    topic: str
