import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

function serviceClient() {
  return createClient(SB_URL, SB_SERVICE)
}

/** Decode JWT payload to get user ID — no API call, no env-var dependency. */
function getUserIdFromJwt(token: string): string | null {
  try {
    // Handle both standard base64 and base64url encoding
    const b64 = token.split('.')[1]
      ?.replace(/-/g, '+')
      .replace(/_/g, '/')
    if (!b64) return null
    // Pad to multiple of 4
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
    if (payload.exp && payload.exp < Date.now() / 1000) {
      console.error('[upload] JWT expired at', new Date(payload.exp * 1000).toISOString())
      return null
    }
    return (payload.sub as string) ?? null
  } catch (err) {
    console.error('[upload] JWT decode error:', err)
    return null
  }
}

function verifyUser(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    console.error('[upload] Missing Authorization header')
    return null
  }
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    console.error('[upload] Empty token after Bearer prefix')
    return null
  }
  const userId = getUserIdFromJwt(token)
  if (!userId) {
    console.error('[upload] Could not extract user ID from token')
  }
  return userId
}

/**
 * Persist a file record to herb_files.
 * Fails silently — storage already succeeded so we still return ok to the client.
 * run_id is optional (not known at upload time for new mandates; set later via link).
 */
async function persistFileRecord(params: {
  userId: string
  runId: string | null
  slotType: string
  name: string
  url: string
  path: string
  size: number
  isGlobal: boolean
}): Promise<void> {
  try {
    const sb = serviceClient()
    const { error } = await sb.from('herb_files').insert({
      user_id: params.userId,
      run_id: params.runId,
      slot_type: params.slotType,
      name: params.name,
      url: params.url,
      path: params.path,
      size: params.size,
      is_global: params.isGlobal,
    })
    if (error) {
      // Table may not exist yet — log but don't fail the upload
      console.warn('[upload] herb_files insert error (non-fatal):', error.message)
    }
  } catch (err) {
    console.warn('[upload] herb_files persist error (non-fatal):', err)
  }
}

// POST /api/upload  — upload a single file, returns { ok, url, path, name, size }
// Form fields: file (required), slotType (optional), index (optional),
//              runId (optional), isGlobal (optional, 'true'/'false')
export async function POST(req: NextRequest) {
  try {
    const userId = verifyUser(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const slotType = (form.get('slotType') as string | null) ?? ''
    const index    = (form.get('index')    as string | null) ?? '0'
    const runId    = (form.get('runId')    as string | null) ?? null
    const isGlobal = (form.get('isGlobal') as string | null) === 'true'

    const safe   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = slotType ? `${slotType}-` : ''
    const path   = `mandates/${userId}/${Date.now()}-${index}-${prefix}${safe}`

    console.log('[upload] starting:', { userId, slotType, fileName: file.name, size: file.size, runId, isGlobal })

    const bytes = await file.arrayBuffer()
    const sb    = serviceClient()
    const { error } = await sb.storage
      .from('herb-uploads')
      .upload(path, bytes, { contentType: file.type || 'application/octet-stream' })

    if (error) {
      console.error('[upload] storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: { publicUrl } } = sb.storage.from('herb-uploads').getPublicUrl(path)
    console.log('[upload] success:', path)

    // Persist to herb_files (non-blocking, non-fatal)
    if (slotType) {
      await persistFileRecord({
        userId,
        runId,
        slotType,
        name: file.name,
        url: publicUrl,
        path,
        size: file.size,
        isGlobal,
      })
    }

    return NextResponse.json({ ok: true, url: publicUrl, path, name: file.name, size: file.size })
  } catch (err: any) {
    console.error('[upload] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/upload  — remove a file by path, body: { path }
export async function DELETE(req: NextRequest) {
  try {
    const userId = verifyUser(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { path } = await req.json()
    if (!path) return NextResponse.json({ error: 'No path' }, { status: 400 })

    // Security: path must belong to this user
    if (!path.startsWith(`mandates/${userId}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sb = serviceClient()
    const { error } = await sb.storage.from('herb-uploads').remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also remove from herb_files if the table exists
    try {
      await sb.from('herb_files').delete().eq('path', path)
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
