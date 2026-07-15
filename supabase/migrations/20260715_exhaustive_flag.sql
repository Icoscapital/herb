-- Exhaustive search flag: when true, source 2 queries EVERY matching fund
-- from the PitchBook universe (no ceiling). Run in the Supabase SQL editor.
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS exhaustive BOOLEAN DEFAULT FALSE;
