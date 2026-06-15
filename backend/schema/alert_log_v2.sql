-- OSINT-15: Add title and rule_name columns to alert_log
-- Run in Supabase SQL editor

ALTER TABLE alert_log
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS rule_name TEXT;
