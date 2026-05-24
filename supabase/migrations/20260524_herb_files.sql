-- herb_files: persistent storage records for file uploads linked to runs
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

CREATE TABLE IF NOT EXISTS herb_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  run_id UUID REFERENCES herb_runs(id) ON DELETE SET NULL,
  slot_type TEXT NOT NULL,  -- 'pitchbook' | 'company-list' | 'check-sites'
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  size INTEGER,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS herb_files_run_id_idx   ON herb_files(run_id);
CREATE INDEX IF NOT EXISTS herb_files_user_id_idx  ON herb_files(user_id);
CREATE INDEX IF NOT EXISTS herb_files_is_global_idx ON herb_files(is_global) WHERE is_global = TRUE;

-- Row-level security
ALTER TABLE herb_files ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by API routes)
DROP POLICY IF EXISTS "service_role_all" ON herb_files;
CREATE POLICY "service_role_all" ON herb_files
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can only see/manage their own files
DROP POLICY IF EXISTS "users_own_files" ON herb_files;
CREATE POLICY "users_own_files" ON herb_files
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
