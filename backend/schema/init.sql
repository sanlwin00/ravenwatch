-- sources
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'zh',
  type TEXT NOT NULL, -- 'official', 'yunnan', 'myanmar', 'thinktank'
  active BOOLEAN NOT NULL DEFAULT true,
  last_scraped_at TIMESTAMPTZ
);

-- articles
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT,
  url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ,
  raw_text_en TEXT,
  raw_text_original TEXT,
  language_original TEXT DEFAULT 'zh',
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_early_signal BOOLEAN NOT NULL DEFAULT false,
  is_policy_signal BOOLEAN NOT NULL DEFAULT false,
  summary_en TEXT
);
CREATE INDEX idx_articles_expires ON articles(expires_at);
CREATE INDEX idx_articles_scraped ON articles(scraped_at DESC);
CREATE INDEX idx_articles_source ON articles(source_id);

-- entities
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_zh TEXT,
  aliases JSONB NOT NULL DEFAULT '[]',
  type TEXT NOT NULL, -- 'person', 'org', 'group'
  tier INTEGER DEFAULT 2, -- 1 or 2
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- article_entities
CREATE TABLE article_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  matched_alias TEXT,
  UNIQUE(article_id, entity_id)
);
CREATE INDEX idx_article_entities_article ON article_entities(article_id);
CREATE INDEX idx_article_entities_entity ON article_entities(entity_id);

-- article_topics
CREATE TABLE article_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, -- 'ceasefire','mediation','border_security','election','bri'
  UNIQUE(article_id, topic)
);
CREATE INDEX idx_article_topics_article ON article_topics(article_id);
CREATE INDEX idx_article_topics_topic ON article_topics(topic);

-- platform_settings
CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_settings (key, value) VALUES
  ('retention_days', '30'),
  ('scraper_frequency_hours', '24');

-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  push_subscription JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- alert_log
CREATE TABLE alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  priority TEXT NOT NULL, -- 'critical', 'high', 'standard'
  channel TEXT NOT NULL, -- 'email', 'telegram', 'push'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_alert_log_sent ON alert_log(sent_at DESC);

-- narrative_metrics
CREATE TABLE narrative_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL,
  term_zh TEXT NOT NULL,
  date DATE NOT NULL,
  frequency INTEGER NOT NULL DEFAULT 0,
  UNIQUE(term, date)
);
CREATE INDEX idx_narrative_term_date ON narrative_metrics(term, date);
