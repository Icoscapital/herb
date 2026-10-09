/**
 * Shared auth helper for API routes.
 *
 * Verifies the bearer token against Supabase Auth (signature + expiry checked
 * server-side) and returns the authenticated user's id. Returns null on any
 * failure — callers should respond 401.
 *
 * Use `requireRunAccess` to also assert that the run referenced in the request
 * exists. Searches are team-shared: any signed-in user may edit, re-run, score
 * or give feedback on any run, not just the one who created it. `user_id` on a
 * run records the creator and is never used as an access check.
 */
import { NextRequest } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function requireUser(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const authClient = createClient(SB_URL, SB_ANON)
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) {
    console.error('[api-auth] JWT validation failed:', error?.message ?? 'no user')
    return null
  }
  return data.user.id
}

export function serviceClient(): SupabaseClient {
  return createClient(SB_URL, SB_SERVICE)
}

/**
 * Verify the caller is authenticated and the referenced run exists.
 * Returns { userId, run } on success, null otherwise.
 */
export async function requireRunAccess(
  req: NextRequest,
  runId: string,
  selectColumns = '*'
): Promise<{ userId: string; run: any } | null> {
  const userId = await requireUser(req)
  if (!userId) return null
  const sb = serviceClient()
  const { data: run, error } = await sb
    .from('herb_runs')
    .select(selectColumns)
    .eq('id', runId)
    .single()
  if (error || !run) return null
  return { userId, run }
}
