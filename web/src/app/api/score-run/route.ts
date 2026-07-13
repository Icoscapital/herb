import { NextRequest, NextResponse } from 'next/server'
import { requireRunOwner, serviceClient } from '@/lib/api-auth'

const GH_PAT = process.env.GITHUB_PAT!
const GH_REPO = 'Icoscapital/herb'

/**
 * Trigger an Icos Fit scoring pass on a completed run whose scoring was
 * skipped at submission. Dispatches the same GitHub workflow with
 * task=score, which runs score_only_prompt.md against the stored longlist.
 */
export async function POST(req: NextRequest) {
  try {
    const { run_id } = await req.json()
    if (!run_id) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    const owner = await requireRunOwner(req, run_id, 'id, status, theme, user_id')
    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (owner.run.status !== 'DONE' && owner.run.status !== 'EMAILED' && owner.run.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: `Run is ${owner.run.status} — scoring needs a completed run` },
        { status: 409 }
      )
    }
    if (!GH_PAT) {
      return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 })
    }

    const dispatchRes = await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_PAT}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'herb-vercel',
      },
      body: JSON.stringify({
        event_type: 'run-web-mandate',
        client_payload: { run_id, task: 'score' },
      }),
    })

    if (!dispatchRes.ok) {
      const errBody = await dispatchRes.text()
      console.error('[score-run] GitHub dispatch failed:', dispatchRes.status, errBody)
      return NextResponse.json({ ok: false, error: `Dispatch failed (${dispatchRes.status})` }, { status: 502 })
    }

    await serviceClient()
      .from('herb_runs')
      .update({
        progress: 'Icos Fit scoring queued — GitHub Actions starting…',
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', run_id)

    return NextResponse.json({ ok: true, message: 'Scoring started (~30s to spin up)' })
  } catch (err: any) {
    console.error('[score-run] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
