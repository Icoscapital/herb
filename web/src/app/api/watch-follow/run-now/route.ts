/**
 * POST /api/watch-follow/run-now
 *
 * Manual trigger — dispatches the herb-watch-follow-tick.yml tick workflow
 * (run-watch-follow-tick repository_dispatch event) so a "Check now" click
 * goes through the same live criteria-selection logic
 * (scripts/watch_follow_tick.py) as the removed bi-weekly cron used to.
 * This is the ONLY way ticks run — there is no schedule.
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

  // Optional keyword narrowing, passed through to watch_follow_tick.py. Capped so a pasted essay
  // cannot become a repository_dispatch payload; the tick treats empty/whitespace as no narrowing.
  const body = await req.json().catch(() => ({}))
  const terms = String(body?.terms ?? '').trim().slice(0, 200) || null

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
      body: JSON.stringify({ event_type: 'run-watch-follow-tick', client_payload: { terms } }),
    }
  )

  if (!dispatchRes.ok) {
    const errBody = await dispatchRes.text()
    console.error('[watch-follow/run-now] GitHub dispatch failed:', dispatchRes.status, errBody)
    return NextResponse.json({ ok: false, error: `Dispatch failed (${dispatchRes.status})` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, message: 'Check started — GitHub Actions is spinning up (~30s)' })
}
