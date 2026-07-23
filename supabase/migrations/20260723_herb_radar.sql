-- Update Radar: curated watch list + bi-weekly job tracking + qualifying findings.
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

-- 1. Curated opt-in list — one row per Pipedrive deal seen across the target
--    stages (Follow Up / Corporate Follow-up / Advanced Follow-up / PUR-DD-FIP),
--    PLUS rows added directly from the dashboard for companies with no
--    Pipedrive deal at all (source='manual'). pipedrive_deal_id is therefore
--    optional; a partial unique index still lets radar_tick.py upsert
--    pipedrive-sourced rows by deal id without colliding on multiple NULLs.
--    radar_tick.py upserts name/domain/stage on every tick for pipedrive rows;
--    `enabled` is the field the dashboard toggles (manual adds start enabled).
--    Team-shared (no user_id) — the curated list is an Icos-wide concept tied
--    to the deal/company, not to whoever toggled or added it.
CREATE TABLE IF NOT EXISTS herb_radar_watch (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pipedrive_deal_id BIGINT,
  company_name TEXT NOT NULL,
  domain TEXT,
  stage_id INTEGER,
  source TEXT NOT NULL DEFAULT 'pipedrive' CHECK (source IN ('pipedrive', 'manual')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS herb_radar_watch_deal_id_uidx
  ON herb_radar_watch(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;

ALTER TABLE herb_radar_watch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON herb_radar_watch;
CREATE POLICY "service_role_all" ON herb_radar_watch
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON herb_radar_watch;
CREATE POLICY "authenticated_all" ON herb_radar_watch
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. One row per bi-weekly tick — job-tracking, mirrors herb_runs's
--    status/heartbeat idiom so the same reaper pattern (reap_stuck_runs.py)
--    can flip a stalled RUNNING row to ERROR.
CREATE TABLE IF NOT EXISTS herb_radar_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | RUNNING | DONE | ERROR
  companies JSONB NOT NULL DEFAULT '[]',    -- curated-deal snapshot at dispatch time
  findings_count INTEGER DEFAULT 0,
  progress TEXT,
  last_heartbeat TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE herb_radar_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON herb_radar_runs;
CREATE POLICY "service_role_all" ON herb_radar_runs
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read" ON herb_radar_runs;
CREATE POLICY "authenticated_read" ON herb_radar_runs
  FOR SELECT TO authenticated USING (true);

-- 3. Qualifying findings only — NONE rows from the research pass are never
--    written here. Deduped on (watch_id, dedupe_key) rather than
--    pipedrive_deal_id so manually-added companies (no deal id) still dedupe
--    correctly — watch_id is always populated, pipedrive_deal_id isn't.
CREATE TABLE IF NOT EXISTS herb_radar_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  radar_run_id UUID REFERENCES herb_radar_runs(id) ON DELETE SET NULL,
  watch_id UUID REFERENCES herb_radar_watch(id) ON DELETE CASCADE,
  pipedrive_deal_id BIGINT,
  company_name TEXT NOT NULL,
  domain TEXT,
  update_type TEXT NOT NULL CHECK (update_type IN ('FUNDING', 'COMPETITOR_FUNDING', 'COMMERCIAL', 'NEWS')),
  headline TEXT NOT NULL,
  detail TEXT,
  source_url TEXT,
  confidence TEXT,
  dedupe_key TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  found_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (watch_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS herb_radar_findings_watch_idx ON herb_radar_findings(watch_id);
CREATE INDEX IF NOT EXISTS herb_radar_findings_deal_idx ON herb_radar_findings(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;

ALTER TABLE herb_radar_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON herb_radar_findings;
CREATE POLICY "service_role_all" ON herb_radar_findings
  TO service_role USING (true) WITH CHECK (true);

-- authenticated_all (not read-only) so the dashboard can flip `acknowledged`.
DROP POLICY IF EXISTS "authenticated_all" ON herb_radar_findings;
CREATE POLICY "authenticated_all" ON herb_radar_findings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
