/**
 * GET /api/radar
 *
 * Lists Update Radar findings, newest first, plus the latest tick's status
 * (herb_radar_runs) so the dashboard can show a live "research in progress"
 * indicator instead of going quiet after the tick itself finishes — the
 * actual research (run-update-radar.yml) can run for several minutes across
 * a large curated set.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = serviceClient()
  const [{ data, error }, { data: runData }] = await Promise.all([
    sb
      .from('herb_radar_findings')
      .select('id, pipedrive_deal_id, company_name, domain, update_type, headline, detail, source_url, confidence, acknowledged, found_at')
      .order('found_at', { ascending: false })
      .limit(200),
    sb
      .from('herb_radar_runs')
      .select('id, status, companies, findings_count, progress, error_message, created_at, finished_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const latestRun = runData
    ? {
        id: runData.id,
        status: runData.status,
        company_count: Array.isArray(runData.companies) ? runData.companies.length : 0,
        findings_count: runData.findings_count,
        progress: runData.progress,
        error_message: runData.error_message,
        created_at: runData.created_at,
        finished_at: runData.finished_at,
      }
    : null

  return NextResponse.json({ findings: data ?? [], latest_run: latestRun })
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
