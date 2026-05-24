/**
 * POST /api/push-to-pipedrive
 *
 * Pushes a single herb_longlist company into Pipedrive:
 *  1. Search Pipedrive for an existing org with the same name.
 *  2. If one exists with any prior deal (open / won / lost) — don't duplicate,
 *     return the existing deal info instead.
 *  3. Otherwise create a fresh org, a placeholder contact, and a deal in the
 *     Icos pipeline / "Deals to discuss" stage. Sets the Investment Manager
 *     custom field to the current user (default: Nityen, option 423).
 *  4. Stamp `notes` on the herb_longlist row so the dashboard renders
 *     "Pipedrive: Deal #N" after a refresh, even though we don't yet have
 *     dedicated pipedrive_deal_id columns.
 *
 * Body: { company_id: string }   // herb_longlist row id
 *
 * Returns one of:
 *  { ok: true,  status: 'created',  deal_id, deal_url, org_id, message }
 *  { ok: true,  status: 'exists',   deal_id, deal_url, org_id, deal_status, message }
 *  { ok: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PD_TOKEN = process.env.PIPEDRIVE_TOKEN!
const PD_DOMAIN = process.env.PIPEDRIVE_DOMAIN || 'icoscapital'
const PD_USER = parseInt(process.env.USER_PIPEDRIVE_ID || '5523', 10)
const PD_IM_OPTION = parseInt(process.env.USER_INVESTMENT_MANAGER_OPTION_ID || '423', 10)
const PD_PIPELINE = parseInt(process.env.DEFAULT_PIPELINE_ID || '9', 10)
const PD_STAGE = parseInt(process.env.DEFAULT_STAGE_ID || '141', 10)

// Custom field hash keys (from scripts/schema_constants.py)
const FIELD_INVESTMENT_MANAGER = '68533ca253cf72116f283dd6b4f33694495ed511'
const FIELD_WEBSITE = '6b60ca85da3cdd92e5e810b929876c53e8562ade'

const PD_BASE = `https://${PD_DOMAIN}.pipedrive.com/api/v1`

type PDOrg = { id: number; name: string; address?: string }
type PDDeal = { id: number; title: string; status: string; pipeline_id: number; lost_reason?: string; close_time?: string }

async function pdGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(PD_BASE + path)
  url.searchParams.set('api_token', PD_TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url.toString(), { method: 'GET' })
  if (!r.ok) throw new Error(`Pipedrive GET ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function pdPost(path: string, body: any): Promise<any> {
  const url = new URL(PD_BASE + path)
  url.searchParams.set('api_token', PD_TOKEN)
  const r = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Pipedrive POST ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

function dealUrl(dealId: number): string {
  return `https://${PD_DOMAIN}.pipedrive.com/deal/${dealId}`
}

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json()
    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id required' }, { status: 400 })
    }
    if (!PD_TOKEN) {
      return NextResponse.json({ ok: false, error: 'PIPEDRIVE_TOKEN not configured' }, { status: 500 })
    }

    const sb = createClient(SB_URL, SB_KEY)

    // 1. Fetch the company row
    const { data: co, error: fetchErr } = await sb
      .from('herb_longlist')
      .select('id, name, website, description, notes, run_id, stage, geography')
      .eq('id', company_id)
      .single()
    if (fetchErr || !co) {
      return NextResponse.json({ ok: false, error: 'company not found' }, { status: 404 })
    }

    // 2. Search for existing org by name
    const search = await pdGet('/organizations/search', {
      term: co.name,
      exact_match: 'false',
      limit: '20',
    })
    const items: { item: PDOrg }[] = search?.data?.items ?? []

    // Best match: exact name (case-insensitive). Otherwise first result if the name is unusual.
    const exactMatch = items.find(i => i.item?.name?.toLowerCase() === co.name.toLowerCase())
    const existingOrg: PDOrg | null = exactMatch?.item ?? (items[0]?.item ?? null)

    if (existingOrg) {
      // 3a. Existing org — check for any non-deleted deals (open/won/lost)
      const dealsResp = await pdGet(`/organizations/${existingOrg.id}/deals`, {
        status: 'all_not_deleted',
        limit: '50',
      })
      const allDeals: PDDeal[] = dealsResp?.data ?? []
      // Prefer deals in the Icos pipeline
      const icosDeals = allDeals.filter(d => d.pipeline_id === PD_PIPELINE)
      const candidate = icosDeals[0] ?? allDeals[0]

      if (candidate) {
        const msg = `Already in Pipedrive (${candidate.status}): ${existingOrg.name}`
        // Stamp the note so the UI reflects this on next page load
        await stampNote(sb, co.id, co.notes, `Pipedrive: ${candidate.status} | Deal #${candidate.id}`)
        return NextResponse.json({
          ok: true,
          status: 'exists',
          deal_id: candidate.id,
          deal_url: dealUrl(candidate.id),
          org_id: existingOrg.id,
          deal_status: candidate.status,
          message: msg,
        })
      }
      // Org exists but no deals — fall through to create a deal on the existing org
      var orgId = existingOrg.id
    } else {
      // 3b. Create new org
      const orgCreate = await pdPost('/organizations', { name: co.name })
      orgId = orgCreate?.data?.id
      if (!orgId) {
        return NextResponse.json({ ok: false, error: 'org create returned no id' }, { status: 500 })
      }
    }

    // 4. Optional placeholder contact (mirrors the Python helper behavior)
    let personId: number | undefined
    if (co.website) {
      try {
        const host = new URL(co.website.startsWith('http') ? co.website : `https://${co.website}`).hostname
        const personResp = await pdPost('/persons', {
          name: `${co.name} Contact`,
          email: [{ value: `contact@${host}`, primary: true }],
          org_id: orgId,
        })
        personId = personResp?.data?.id
      } catch {
        // non-fatal — proceed without a person
      }
    }

    // 5. Create deal
    const dealPayload: any = {
      title: `${co.name} - Herb`,
      org_id: orgId,
      pipeline_id: PD_PIPELINE,
      stage_id: PD_STAGE,
      user_id: PD_USER,
      visible_to: 3, // all_users
      [FIELD_INVESTMENT_MANAGER]: PD_IM_OPTION,
    }
    if (personId) dealPayload.person_id = personId
    if (co.website) dealPayload[FIELD_WEBSITE] = co.website
    const dealResp = await pdPost('/deals', dealPayload)
    const dealId = dealResp?.data?.id
    if (!dealId) {
      return NextResponse.json({ ok: false, error: 'deal create returned no id' }, { status: 500 })
    }

    // 6. Stamp note so the UI persists the state on refresh
    await stampNote(sb, co.id, co.notes, `Pipedrive: New | Deal #${dealId}`)

    return NextResponse.json({
      ok: true,
      status: 'created',
      deal_id: dealId,
      deal_url: dealUrl(dealId),
      org_id: orgId,
      message: `Deal created for ${co.name}`,
    })
  } catch (err: any) {
    console.error('[push-to-pipedrive] error:', err)
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 })
  }
}

async function stampNote(
  sb: any,
  companyId: string,
  currentNotes: string | null,
  marker: string,
): Promise<void> {
  // Strip any existing "Pipedrive: ..." prefix (up to the next | or end of string),
  // then prepend the new marker.
  const cleaned = (currentNotes ?? '').replace(/Pipedrive:\s*[^|]*\|?\s*/i, '').trim()
  const newNotes = cleaned ? `${marker} | ${cleaned}` : marker
  await sb.from('herb_longlist').update({ notes: newNotes }).eq('id', companyId)
}
