-- Surfaces Herb's interpreted search plan (must-haves, keywords, sources,
-- regions) on the dashboard within the first ~30-60s of a run, before
-- results are ready — lets the author catch a misread mandate early.
-- Run in the Supabase SQL editor.
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS search_plan TEXT;
