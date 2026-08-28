/**
 * GET /api/watch-follow/deals
 *
 * Live, read-only Pipedrive fetch of every deal automatically in scope for
 * Updates On Watch & Follow. No watch table, no manual toggle, no
 * enabled/disabled state — a deal qualifies purely by criteria:
 *   - its pipeline-9 stage has order_nr >= 4 ("Corporate view" or any stage
 *     after it in board order) — resolved live via GET /stages every call,
 *     never hardcoded, since this pipeline's stage ids/names have been
 *     renamed/reordered repeatedly;
 *   - status is open, won, or lost (not deleted) — status=all_not_deleted;
 *   - CEP Interest (a multi-select custom field) is non-empty;
 *   - Framework Verdict does not include option 728 ("No Go - Not a fit");
 *     null/unset verdict (not yet categorised) still qualifies.
 * Mirrors scripts/watch_follow_tick.py and Vantage's radar_candidates().
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const PD_TOKEN = process.env.PIPEDRIVE_TOKEN!
const PD_DOMAIN = process.env.PIPEDRIVE_DOMAIN || 'icoscapital'
const PD_BASE = `https://${PD_DOMAIN}.pipedrive.com/api/v1`
const PIPELINE_ICOS = 9
const MIN_ORDER_NR = 4

// From scripts/schema_constants.py's DEAL_FIELD.
const FIELD_WEBSITE = '6b60ca85da3cdd92e5e810b929876c53e8562ade'
const FIELD_CEP_INTEREST = 'eae659774facd085f9b39b19ce437bf65276112e'
const FIELD_FRAMEWORK_VERDICT = '22e0b9aee74aac97920abc2eb07bbc4c2b9b3966'
const FRAMEWORK_VERDICT_NO_GO = '728'

async function pdGet(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${PD_BASE}${path}`)
  url.searchParams.set('api_token', PD_TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url.toString())
  if (!r.ok) throw new Error(`Pipedrive GET ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function resolveTargetStages(): Promise<Map<number, string>> {
  const json = await pdGet('/stages', { pipeline_id: String(PIPELINE_ICOS) })
  const stages = (json.data ?? []) as Array<{ id: number; name: string; order_nr: number }>
  const map = new Map<number, string>()
  for (const s of stages) {
    if ((s.order_nr ?? 0) >= MIN_ORDER_NR) map.set(s.id, s.name)
  }
  return map
}

async function pdGetAllForStage(stageId: number): Promise<any[]> {
  const out: any[] = []
  let start = 0
  for (;;) {
    const json = await pdGet('/deals', {
      stage_id: String(stageId),
      status: 'all_not_deleted',
      start: String(start),
      limit: '100',
    })
    out.push(...(json.data ?? []))
    const pag = json?.additional_data?.pagination
    if (!pag?.more_items_in_collection) break
    start = pag.next_start ?? start + 100
  }
  return out
}

function qualifies(deal: any): boolean {
  const cepInterest = deal[FIELD_CEP_INTEREST]
  if (!cepInterest) return false
  const verdict = deal[FIELD_FRAMEWORK_VERDICT]
  if (verdict) {
    const optionIds = String(verdict).split(',').map((v: string) => v.trim())
    if (optionIds.includes(FRAMEWORK_VERDICT_NO_GO)) return false
  }
  return true
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
    const stageNames = await resolveTargetStages()
    const seenIds = new Set<number>()
    const deals: Array<{
      pipedrive_deal_id: number
      company_name: string
      domain: string
      stage_name: string
    }> = []

    for (const [stageId, stageName] of stageNames) {
      const batch = await pdGetAllForStage(stageId)
      for (const d of batch) {
        if (!d.id || seenIds.has(d.id) || !qualifies(d)) continue
        seenIds.add(d.id)
        deals.push({
          pipedrive_deal_id: d.id,
          company_name: d.org_id?.name || d.title || '',
          domain: (d[FIELD_WEBSITE] || '').toString().toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
          stage_name: stageName,
        })
      }
    }

    return NextResponse.json({ deals })
  } catch (err: any) {
    console.error('[watch-follow/deals] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
