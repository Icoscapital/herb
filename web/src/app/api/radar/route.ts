/**
 * GET /api/radar
 *
 * Lists Update Radar findings, newest first.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = serviceClient()
  const { data, error } = await sb
    .from('herb_radar_findings')
    .select('id, pipedrive_deal_id, company_name, domain, update_type, headline, detail, source_url, confidence, acknowledged, found_at')
    .order('found_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ findings: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, acknowledged } = await req.json()
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  const sb = serviceClient()
  const { error } = await sb
    .from('herb_radar_findings')
    .update({ acknowledged: !!acknowledged })
    .eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
