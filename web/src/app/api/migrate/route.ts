import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// One-shot migration route — creates herb_files table if it doesn't exist.
// Protected by a shared secret so it can't be called by random users.
// Call once after deployment: GET /api/migrate?secret=<MIGRATE_SECRET>

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const expected = process.env.MIGRATE_SECRET ?? 'herb-migrate-2026'
  if (secret !== expected) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = createClient(SB_URL, SB_SERVICE)

  // PostgREST doesn't support raw DDL, but we can use a trick:
  // Call the rpc endpoint with a Postgres function that executes DDL.
  // We'll create the function first via a special header, or use the
  // Management API pattern of calling the postgres endpoint.
  //
  // Since we can't run raw SQL via supabase-js without an RPC function,
  // we probe for the table and return instructions if it doesn't exist.

  try {
    const { error: probeError } = await sb
      .from('herb_files')
      .select('id')
      .limit(1)

    if (!probeError) {
      return NextResponse.json({ ok: true, message: 'herb_files table already exists' })
    }

    // Table doesn't exist — return the SQL to run manually
    const sql = `
CREATE TABLE IF NOT EXISTS herb_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  run_id UUID REFERENCES herb_runs(id) ON DELETE SET NULL,
  slot_type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS herb_files_run_id_idx ON herb_files(run_id);
CREATE INDEX IF NOT EXISTS herb_files_user_id_idx ON herb_files(user_id);
CREATE INDEX IF NOT EXISTS herb_files_is_global_idx ON herb_files(is_global) WHERE is_global = TRUE;

ALTER TABLE herb_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON herb_files TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "users_own_files" ON herb_files FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
`.trim()

    return NextResponse.json({
      ok: false,
      message: 'herb_files table does not exist. Run the SQL below in Supabase SQL editor.',
      sql,
    }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
