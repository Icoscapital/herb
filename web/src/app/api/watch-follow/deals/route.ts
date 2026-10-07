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
 *   - status is open or lost, never won — fetched as all_not_deleted (the API has no open-and-lost
 *     value) and won dropped in qualifies();
 *   - CEP Interest (a multi-select custom field) is non-empty;
 *   - Framework Verdict does not include option 728 ("No Go - Not a fit");
 *     null/unset verdict (not yet categorised) still qualifies.
 * Mirrors scripts/watch_follow_tick.py and Vantage's radar_candidates().
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { Pipedrive, ICOS_PIPEDRIVE, DEAL_FIELD_NAMES, DEAL_OPTION_LABELS, type FieldMap } from '@/lib/icos-pipedrive'

const PD_TOKEN = process.env.PIPEDRIVE_TOKEN || process.env.PIPEDRIVE_API_TOKEN || ''
const PIPELINE_ICOS = ICOS_PIPEDRIVE.pipelineId
const MIN_ORDER_NR = 4

// Pipedrive goes through the estate-wide @icos/pipedrive client (web/src/lib/icos-pipedrive.ts, vendored).
// Custom-field keys and the "No Go" option id are resolved by NAME per request (Vantage rule 3) —
// scripts/schema_constants.py still carries the hashes for the Python side.
let _pd: Pipedrive | null = null
const pd = () => (_pd ??= new Pipedrive())

type Keys = { website: string; cepInterest: string; frameworkVerdict: string; noGoOptionId: string }
function keysFrom(fields: FieldMap): Keys {
  return {
    website: fields.key(DEAL_FIELD_NAMES.website),
    cepInterest: fields.key(DEAL_FIELD_NAMES.cepInterest),
    frameworkVerdict: fields.key(DEAL_FIELD_NAMES.frameworkVerdict),
    noGoOptionId: String(fields.optionId(DEAL_FIELD_NAMES.frameworkVerdict, DEAL_OPTION_LABELS.frameworkVerdictNoGo)),
  }
}


async function resolveTargetStages(): Promise<Map<number, string>> {
  const stages = (await pd().stages(PIPELINE_ICOS)) as Array<{ id: number; name: string; order_nr: number }>
  const map = new Map<number, string>()
  for (const s of stages) {
    if ((s.order_nr ?? 0) >= MIN_ORDER_NR) map.set(s.id, s.name)
  }
  return map
}

function pdGetAllForStage(stageId: number): Promise<any[]> {
  return pd().all('/deals', { stage_id: stageId, status: 'all_not_deleted' }, { limit: 100 })
}

function qualifies(deal: any, k: Keys): boolean {
  // Must mirror scripts/watch_follow_tick.py exactly, or this page lists companies the tick will not
  // actually check. Won excluded 2026-08-28 — a won deal is portfolio, not dealflow to form a view on.
  if (deal.status === 'won') return false
  const cepInterest = deal[k.cepInterest]
  if (!cepInterest) return false
  const verdict = deal[k.frameworkVerdict]
  if (verdict) {
    const optionIds = String(verdict).split(',').map((v: string) => v.trim())
    if (optionIds.includes(k.noGoOptionId)) return false
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
    const k = keysFrom(await pd().dealFieldMap())
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
        if (!d.id || seenIds.has(d.id) || !qualifies(d, k)) continue
        seenIds.add(d.id)
        deals.push({
          pipedrive_deal_id: d.id,
          company_name: d.org_id?.name || d.title || '',
          domain: (d[k.website] || '').toString().toLowerCase()
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
