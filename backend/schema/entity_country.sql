ALTER TABLE entities ADD COLUMN IF NOT EXISTS country TEXT CHECK (country IN ('CN', 'MM'));
