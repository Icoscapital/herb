-- Icos-fit scoring is now opt-IN (default off), and sub-10-FTE companies
-- are excluded by default on ALL searches unless include_small is checked.
-- Run in the Supabase SQL editor.
ALTER TABLE herb_runs ALTER COLUMN icos_fit SET DEFAULT FALSE;
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS include_small BOOLEAN DEFAULT FALSE;
