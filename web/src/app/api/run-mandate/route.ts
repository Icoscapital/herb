import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GH_PAT = process.env.GITHUB_PAT!
const GH_REPO = 'Icoscapital/herb'

export async function POST(req: NextRequest) {
  try {
    const { run_id } = await req.json()
    if (!run_id) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    // Verify the run exists and is PENDING
    const sb = createClient(SB_URL, SB_KEY)
    const { data: run, error: fetchErr } = await sb
      .from('herb_runs')
      .select('id, status, theme')
      .eq('id', run_id)
      .single()

    if (fetchErr || !run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }
    if (run.status !== 'PENDING') {
      return NextResponse.json({ error: `Run is ${run.status}, not PENDING` }, { status: 409 })
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

    // GitHub returns 204 No Content on success
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
