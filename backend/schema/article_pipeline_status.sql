-- OSINT-21: Per-article pipeline status columns
-- Run once in Supabase SQL editor

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS tagging_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (tagging_status IN ('pending', 'done', 'failed'));

-- Backfill translation_status
UPDATE articles
SET translation_status = 'done'
WHERE raw_text_en IS NOT NULL;

-- Backfill tagging_status
UPDATE articles
SET tagging_status = 'done'
WHERE id IN (
  SELECT DISTINCT article_id FROM article_entities
  UNION
  SELECT DISTINCT article_id FROM article_topics
);

CREATE INDEX IF NOT EXISTS idx_articles_translation_status ON articles (translation_status);
CREATE INDEX IF NOT EXISTS idx_articles_tagging_status ON articles (tagging_status);
