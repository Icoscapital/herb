-- Updates On Watch & Follow: rename from "Update Radar" + replace the
-- manually curated opt-in watch list with fully automatic criteria-based
-- selection. 2026-08-27.
--
-- WHY THE RENAME: Herb already has an unrelated feature also informally
-- called "Watch" (scripts/watch_tick.py / herb-watch.yml — a monthly
-- re-run of a saved sourcing-mandate search for brand-new companies).
-- "Update Radar" checking existing Pipedrive deals for funding/news signal
-- was a completely different thing that happened to sit right next to it,
-- and the naming collision kept confusing people. Renaming this feature to
-- "Updates On Watch & Follow" removes the ambiguity for good.
--
-- WHY THE MECHANISM CHANGE: the old herb_radar_watch table was a manual
-- opt-in list — someone had to tick a checkbox per deal (or add a
-- deal-less company by hand) before it ever got checked. In practice that
-- meant real signal was being missed on deals nobody remembered to enable.
-- Going forward there is no watch list and no toggle at all: every tick,
-- scripts/watch_follow_tick.py (and the dashboard's read-only "currently in
-- scope" view) computes the candidate set fresh, live, from Pipedrive:
--   - stage: pipeline-9 stage order_nr >= 4 ("Corporate view" or later),
--     resolved live via GET /stages every run (this pipeline's stage
--     ids/names have been renamed/reordered three times in the last week
--     alone, so nothing here may ever hardcode a stage id again);
--   - status: open, won, AND lost (not deleted);
--   - CEP Interest (a Pipedrive multi-select) is non-empty;
--   - Framework Verdict does not carry option 728 ("No Go - Not a fit");
--     null/unset (not yet categorised) still qualifies.
-- This mirrors a Supabase function called radar_candidates() already built
-- in Vantage, a sibling app run against the same Pipedrive account — credit
-- there for the criteria definition; this migration just brings the same
-- logic to Herb's own tables/schema.
--
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

-- 1. Rename the job-tracking + findings tables. Postgres renames the table
--    in place (same OID) — indexes, RLS policies, and inbound FKs pointing
--    at it all keep working under the new name automatically; only object
--    names that were derived from the OLD table name at creation time
--    (constraint/index names below) keep their original text.
ALTER TABLE herb_radar_runs RENAME TO herb_watch_follow_runs;
ALTER TABLE herb_radar_findings RENAME TO herb_watch_follow_findings;

-- 2. Drop the watch_id identity column (and the FK + unique constraint that
--    were defined on it) — there is no more herb_radar_watch row to point
--    at. Every candidate now comes straight from a live, criteria-selected
--    Pipedrive deal, so pipedrive_deal_id becomes the identity/dedupe
--    anchor instead. These constraint names were assigned by Postgres at
--    CREATE TABLE time under the OLD table name and don't change on
--    rename, hence the herb_radar_findings_* prefix below even though the
--    table itself is now herb_watch_follow_findings.
ALTER TABLE herb_watch_follow_findings
  DROP CONSTRAINT IF EXISTS herb_radar_findings_watch_id_dedupe_key_key,
  DROP CONSTRAINT IF EXISTS herb_radar_findings_watch_id_fkey,
  DROP COLUMN IF EXISTS watch_id;

-- A NULL pipedrive_deal_id can't usefully dedupe against another NULL row,
-- but that's fine to leave as-is: Postgres allows multiple NULLs in a
-- unique constraint (NULL is never considered equal to NULL), and the only
-- rows that could ever have had a null pipedrive_deal_id were from the
-- manually-added-company path (source='manual' in herb_radar_watch), which
-- no longer exists as of this migration — no backfill/cleanup needed.
ALTER TABLE herb_watch_follow_findings
  ADD CONSTRAINT herb_watch_follow_findings_deal_dedupe_key UNIQUE (pipedrive_deal_id, dedupe_key);

-- herb_radar_findings_watch_idx (a plain index on the now-dropped watch_id
-- column) is dropped automatically by Postgres along with the column
-- above — no explicit DROP INDEX needed. herb_radar_findings_deal_idx (on
-- pipedrive_deal_id) is untouched and still valid; its old-table-name
-- prefix is cosmetic only, same as the constraint names above.

-- 3. Drop the opt-in watch table entirely — criteria-based selection
--    replaces it completely, there is nothing left to curate by hand.
DROP TABLE IF EXISTS herb_radar_watch;

-- 4. Recreate RLS policies under the renamed tables. Strictly speaking this
--    step is redundant — ALTER TABLE ... RENAME does not touch a table's
--    policies, so the "service_role_all" / "authenticated_read" /
--    "authenticated_all" policies created in 20260723_herb_radar.sql are
--    still attached (by OID) and already enforcing correctly against the
--    new names. They're redeclared below anyway, verbatim, purely so the
--    policy definitions live somewhere discoverable under the new table
--    names rather than only in an old migration file named after the
--    thing this one just renamed away.
DROP POLICY IF EXISTS "service_role_all" ON herb_watch_follow_runs;
CREATE POLICY "service_role_all" ON herb_watch_follow_runs
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read" ON herb_watch_follow_runs;
CREATE POLICY "authenticated_read" ON herb_watch_follow_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_all" ON herb_watch_follow_findings;
CREATE POLICY "service_role_all" ON herb_watch_follow_findings
  TO service_role USING (true) WITH CHECK (true);

-- authenticated_all (not read-only) so the dashboard can flip `acknowledged`.
DROP POLICY IF EXISTS "authenticated_all" ON herb_watch_follow_findings;
CREATE POLICY "authenticated_all" ON herb_watch_follow_findings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
