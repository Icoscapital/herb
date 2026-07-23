/**
 * POST /api/radar/toggle
 *
 * Flip a company's curated-watch-list membership. Two shapes:
 *  - Manually-added companies (no Pipedrive deal): { id, enabled } — updates
 *    the existing herb_radar_watch row by its UUID.
 *  - Pipedrive-synced deals: { pipedrive_deal_id, enabled, company_name,
 *    domain, stage_id } — upserts by deal id (first toggle may predate any
 *    tick having synced this deal into herb_radar_watch yet).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, pipedrive_deal_id, enabled, company_name, domain, stage_id } = await req.json()
  const sb = serviceClient()

  if (id) {
    const { error } = await sb
      .from('herb_radar_watch')
      .update({ enabled: !!enabled, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (!pipedrive_deal_id) {
    return NextResponse.json({ error: 'id or pipedrive_deal_id required' }, { status: 400 })
  }

  const { error } = await sb
    .from('herb_radar_watch')
    .upsert({
      pipedrive_deal_id,
      enabled: !!enabled,
      company_name: company_name ?? '',
      domain: domain ?? '',
      stage_id: stage_id ?? null,
      source: 'pipedrive',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pipedrive_deal_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
