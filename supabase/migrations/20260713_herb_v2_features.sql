-- Herb v2 features: optional Icos-fit, seed examples, watch mode,
-- deep-dive column, and cross-mandate memory (herb_seen).
-- Run this in the Supabase SQL editor (project lwgypkokjqerkgcpqhnt).

-- 1. Run-level options
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS icos_fit BOOLEAN DEFAULT TRUE;
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS seed_companies TEXT;
ALTER TABLE herb_runs ADD COLUMN IF NOT EXISTS watch BOOLEAN DEFAULT FALSE;

-- 2. Deep-dive text per company
ALTER TABLE herb_longlist ADD COLUMN IF NOT EXISTS deep_dive TEXT;

-- 3. Cross-mandate memory: every company Herb has ever surfaced
CREATE TABLE IF NOT EXISTS herb_seen (
  company_key TEXT PRIMARY KEY,          -- normalized: domain if known, else lowercase name
  name TEXT NOT NULL,
  domain TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  times_seen INTEGER DEFAULT 1,
  mandates JSONB DEFAULT '[]'::jsonb,    -- [{run_id, theme, round, at}]
  last_status TEXT DEFAULT 'longlisted', -- longlisted | excluded | pushed_to_pipedrive
  notes TEXT
);

CREATE INDEX IF NOT EXISTS herb_seen_domain_idx ON herb_seen(domain) WHERE domain IS NOT NULL AND domain <> '';
CREATE INDEX IF NOT EXISTS herb_seen_last_seen_idx ON herb_seen(last_seen_at);

ALTER TABLE herb_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON herb_seen;
CREATE POLICY "service_role_all" ON herb_seen TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_read" ON herb_seen;
CREATE POLICY "authenticated_read" ON herb_seen FOR SELECT TO authenticated USING (true);
