-- Update Radar: revert curated-set default from opt-out back to opt-in.
-- The opt-out default (20260724_herb_radar_default_enabled.sql) meant every
-- new Pipedrive deal in the target stages silently got bi-weekly Anthropic
-- checks with nobody deciding that. Cost is currently attributed to a single
-- shared API key alongside the mandate agent and the Pipedrive-push note
-- generator, so this was easy to miss. Going forward, a new deal is watched
-- only once someone turns it on from the dashboard.
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

ALTER TABLE herb_radar_watch ALTER COLUMN enabled SET DEFAULT FALSE;

-- Deliberately NOT touching existing rows: any deal already enabled (by the
-- 2026-07-24 backfill or by hand) stays enabled. Review and disable specific
-- ones from the dashboard if desired — this migration only changes what
-- happens for deals synced from here on.
