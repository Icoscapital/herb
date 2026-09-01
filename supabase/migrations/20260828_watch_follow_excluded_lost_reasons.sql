-- Updates On Watch & Follow: lost reasons that take a company out entirely. 2026-08-28.
--
-- Nityen: "it should not include deals with lost reason No fit - business focus, No fit - business
-- model or No fit - fund geography". These name a permanent mismatch, as opposed to a timing or
-- process loss ("too early stage", "no corporate buy-in") where a company could become relevant
-- again.
--
-- A TABLE, not three literals in watch_follow_tick.py, for the same reason Vantage made it one
-- (migration 057 there): as given, the three strings match ZERO deals in the mirrored Pipedrive data
-- — nothing contains "business focus" or "fund geography", and the only "business model" value is
-- "Wrong business model". Hardcoding strings that match nothing yields a filter that silently does
-- nothing while looking correct. A table can be fixed with one UPDATE against the real Pipedrive
-- Lost Reason options, with no redeploy.
--
-- Matched case-insensitively and trimmed: lost_reason is free text in practice, so the same reason
-- appears as both "no corporate buy-in" and "No corporate buy-in".
--
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

CREATE TABLE IF NOT EXISTS herb_watch_follow_excluded_lost_reason (
  lost_reason TEXT PRIMARY KEY,
  note        TEXT
);

INSERT INTO herb_watch_follow_excluded_lost_reason (lost_reason, note) VALUES
  ('No fit - business focus', 'Nityen 2026-08-28. No deal carries this value yet — verify against the Pipedrive Lost Reason options.'),
  ('No fit - business model', 'Nityen 2026-08-28. Closest live value is "Wrong business model".'),
  ('No fit - fund geography', 'Nityen 2026-08-28. No deal carries this value yet; "Not in focus region" may be intended.')
ON CONFLICT (lost_reason) DO NOTHING;

ALTER TABLE herb_watch_follow_excluded_lost_reason ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON herb_watch_follow_excluded_lost_reason;
CREATE POLICY "service_role_all" ON herb_watch_follow_excluded_lost_reason
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read" ON herb_watch_follow_excluded_lost_reason;
CREATE POLICY "authenticated_read" ON herb_watch_follow_excluded_lost_reason
  FOR SELECT TO authenticated USING (true);
