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
    const b64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
    if (!b64) return null
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
    if (payload.exp && payload.exp < Date.now() / 1000) return null   // expired
    return (payload.sub as string) ?? null
  } catch {
    return null
  }
}

function verifyUser(req: NextRequest): string | null {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  return getUserIdFromJwt(token)
}

// POST /api/upload  — upload a single file, returns { ok, url, path, name, size }
export async function POST(req: NextRequest) {
  try {
    const userId = verifyUser(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const slotType = (form.get('slotType') as string | null) ?? ''
    const index    = (form.get('index')    as string | null) ?? '0'

    const safe   = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const prefix = slotType ? `${slotType}-` : ''
    const path   = `mandates/${userId}/${Date.now()}-${index}-${prefix}${safe}`

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

    const { error } = await serviceClient().storage.from('herb-uploads').remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
