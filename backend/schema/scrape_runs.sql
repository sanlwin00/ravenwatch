CREATE TABLE scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  articles_added INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error'
  error_message TEXT
);
CREATE INDEX idx_scrape_runs_started ON scrape_runs(started_at DESC);
