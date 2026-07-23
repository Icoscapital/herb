-- Update Radar: flip curated-set default from opt-in to opt-out.
-- Every deal in the target stages should be checked automatically; the
-- watch-list toggle is now for excluding a deal, not admitting it.
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

ALTER TABLE herb_radar_watch ALTER COLUMN enabled SET DEFAULT TRUE;

-- Backfill: enable every pipedrive-sourced deal synced so far. Safe to run
-- now — nothing has been manually toggled off yet (this ships alongside the
-- very first tick that ever ran). If you've since turned specific deals off
-- on purpose, skip this UPDATE and re-enable the rest by hand instead.
UPDATE herb_radar_watch SET enabled = true WHERE source = 'pipedrive';
