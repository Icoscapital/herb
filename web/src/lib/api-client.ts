/**
 * Client-side wrapper for authenticated fetch calls to our /api routes.
 * Automatically attaches the Supabase bearer token from the current session.
 *
 * Usage:
 *   const res = await authedFetch('/api/run-mandate', {
 *     method: 'POST',
 *     body: JSON.stringify({ run_id }),
 *   })
 *
 * If there's no active session, returns a synthetic 401 Response so callers
 * don't have to special-case the unauth flow.
 */
import { supabase } from '@/lib/supabase'

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return new Response(JSON.stringify({ error: 'No active session' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }
  const headers = new Headers(init?.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  // Only set JSON content-type if we have a string/object body and one isn't already set.
  // (Don't set for FormData uploads — the browser sets multipart boundary.)
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(input, { ...init, headers })
}
