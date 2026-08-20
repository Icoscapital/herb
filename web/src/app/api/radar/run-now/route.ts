/**
 * POST /api/radar/run-now
 *
 * Manual trigger — dispatches the herb-radar.yml tick workflow (run-radar-tick
 * repository_dispatch event) so a "Check now" click goes through the same
 * curated-set resolution logic (scripts/radar_tick.py) as the removed
 * bi-weekly cron used to. This is now the ONLY way radar ticks run — the
 * schedule was removed 2026-08-20.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const GH_PAT = process.env.GITHUB_PAT!
const GH_REPO = 'Icoscapital/herb'

export async function POST(req: NextRequest) {
  const userId = await requireUser(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!GH_PAT) {
    return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 })
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GH_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'herb-vercel',
      },
      body: JSON.stringify({ event_type: 'run-radar-tick' }),
    }
  )

  if (!dispatchRes.ok) {
    const errBody = await dispatchRes.text()
    console.error('[radar/run-now] GitHub dispatch failed:', dispatchRes.status, errBody)
    return NextResponse.json({ ok: false, error: `Dispatch failed (${dispatchRes.status})` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, message: 'Radar check started — GitHub Actions is spinning up (~30s)' })
}
