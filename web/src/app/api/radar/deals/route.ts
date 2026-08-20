/**
 * GET /api/radar/deals
 *
 * Live Pipedrive fetch of every open deal across the Update Radar's target
 * stages (Follow Up, Corporate Follow-up, Advanced Follow-up, PUR/DD/FIP),
 * left-joined with herb_radar_watch for the current curated-list toggle
 * state — live rather than reading herb_radar_watch alone so the list is
 * accurate even before a "Check now" tick has ever run. Manually-added
 * companies (source='manual', no Pipedrive deal) are appended from
 * herb_radar_watch directly since there's nothing to fetch from Pipedrive.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

const PD_TOKEN = process.env.PIPEDRIVE_TOKEN!
const PD_DOMAIN = process.env.PIPEDRIVE_DOMAIN || 'icoscapital'
const PD_BASE = `https://${PD_DOMAIN}.pipedrive.com/api/v1`

// From scripts/schema_constants.py — Follow Up, Corporate Follow-up,
// Advanced Follow-up, PUR/DD/FIP (excludes Follow-on Portfolio + Quickscan,
// which sit numerically between these on the board but are out of scope).
const TARGET_STAGES = [139, 145, 144, 100]
const FIELD_WEBSITE = '6b60ca85da3cdd92e5e810b929876c53e8562ade'

async function pdGetAllForStage(stageId: number): Promise<any[]> {
  const out: any[] = []
  let start = 0
  for (;;) {
    const url = new URL(`${PD_BASE}/deals`)
    url.searchParams.set('api_token', PD_TOKEN)
    url.searchParams.set('stage_id', String(stageId))
    url.searchParams.set('status', 'open')
    url.searchParams.set('start', String(start))
    url.searchParams.set('limit', '100')
    const r = await fetch(url.toString())
    if (!r.ok) throw new Error(`Pipedrive GET /deals → ${r.status}: ${await r.text()}`)
    const json = await r.json()
    out.push(...(json.data ?? []))
    const pag = json?.additional_data?.pagination
    if (!pag?.more_items_in_collection) break
    start = pag.next_start ?? start + 100
  }
  return out
}

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!PD_TOKEN) {
    return NextResponse.json({ error: 'PIPEDRIVE_TOKEN not configured' }, { status: 500 })
  }

  try {
    const seenIds = new Set<number>()
    const deals: Array<{
      id: string | null
      pipedrive_deal_id: number
      company_name: string
      domain: string
      stage_id: number | null
      source: 'pipedrive'
    }> = []

    for (const stageId of TARGET_STAGES) {
      const batch = await pdGetAllForStage(stageId)
      for (const d of batch) {
        if (!d.id || seenIds.has(d.id)) continue
        seenIds.add(d.id)
        deals.push({
          id: null,
          pipedrive_deal_id: d.id,
          company_name: d.org_id?.name || d.title || '',
          domain: (d[FIELD_WEBSITE] || '').toString().toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          stage_id: stageId,
          source: 'pipedrive',
        })
      }
    }

    const sb = serviceClient()
    const { data: watchRows } = await sb
      .from('herb_radar_watch')
      .select('id, pipedrive_deal_id, company_name, domain, source, enabled')

    const byDealId = new Map((watchRows ?? []).filter(r => r.pipedrive_deal_id != null).map(r => [r.pipedrive_deal_id, r]))
    const merged = deals.map(d => {
      const watch = byDealId.get(d.pipedrive_deal_id)
      return { ...d, id: watch?.id ?? null, enabled: !!watch?.enabled }
    })

    // Manually-added companies have no Pipedrive deal — append them as their own rows.
    const manual = (watchRows ?? [])
      .filter(r => r.source === 'manual')
      .map(r => ({
        id: r.id,
        pipedrive_deal_id: null,
        company_name: r.company_name,
        domain: r.domain || '',
        stage_id: null,
        source: 'manual' as const,
        enabled: !!r.enabled,
      }))

    return NextResponse.json({ deals: [...merged, ...manual] })
  } catch (err: any) {
    console.error('[radar/deals] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
