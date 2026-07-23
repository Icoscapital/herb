/**
 * POST /api/radar/companies
 *
 * Add a company to the Update Radar watch list directly — for tracking a
 * company that has no Pipedrive deal at all (source='manual'). Starts
 * enabled=true: adding it IS the opt-in, unlike Pipedrive-synced rows which
 * default to disabled until toggled on. Picked up by the next tick (cron or
 * "Check now") same as any other enabled row.
 *
 * Body: { company_name: string, domain?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { company_name, domain } = await req.json()
  const name = (company_name || '').trim()
  if (!name) {
    return NextResponse.json({ error: 'company_name required' }, { status: 400 })
  }

  const cleanDomain = (domain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]

  const sb = serviceClient()
  const { data, error } = await sb
    .from('herb_radar_watch')
    .insert({
      company_name: name,
      domain: cleanDomain || null,
      source: 'manual',
      enabled: true,
    })
    .select('id, company_name, domain, source, enabled')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, company: data })
}
