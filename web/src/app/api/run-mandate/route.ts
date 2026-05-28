import { NextRequest, NextResponse } from 'next/server'
import { requireRunOwner, serviceClient } from '@/lib/api-auth'

const GH_PAT = process.env.GITHUB_PAT!
const GH_REPO = 'Icoscapital/herb'

export async function POST(req: NextRequest) {
  try {
    const { run_id } = await req.json()
    if (!run_id) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    // Verify caller is authenticated AND owns this run
    const owner = await requireRunOwner(req, run_id, 'id, status, theme, user_id')
    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { run } = owner
    const sb = serviceClient()

    if (run.status !== 'PENDING' && run.status !== 'ERROR') {
      return NextResponse.json({ error: `Run is ${run.status} — only PENDING or ERROR runs can be re-triggered` }, { status: 409 })
    }

    if (!GH_PAT) {
      return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 })
    }

    // Trigger the GitHub Actions workflow via repository_dispatch
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
        body: JSON.stringify({
          event_type: 'run-web-mandate',
          client_payload: { run_id },
        }),
      }
    )

    if (!dispatchRes.ok) {
      const errBody = await dispatchRes.text()
      console.error('[run-mandate] GitHub dispatch failed:', dispatchRes.status, errBody)
      return NextResponse.json({
        ok: false,
        queued: true,
        message: `Could not start immediately (${dispatchRes.status}), run will execute on next hourly tick.`,
      })
    }

    // GitHub returns 204 No Content on success.
    // Flip the run to SEARCHING immediately so the UI hides the Run button.
    // The workflow will keep updating heartbeat/progress and set DONE when finished.
    await sb
      .from('herb_runs')
      .update({
        status: 'SEARCHING',
        progress: 'Dispatched — GitHub Actions starting…',
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', run_id)

    console.log('[run-mandate] GitHub dispatch succeeded for run_id:', run_id)
    return NextResponse.json({
      ok: true,
      triggered: true,
      message: 'Search started — GitHub Actions is spinning up (~30s)',
    })
  } catch (err: any) {
    console.error('[run-mandate] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
