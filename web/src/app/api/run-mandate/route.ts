import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// herb-cloud CCR routine ID
const TRIGGER_ID = 'trig_01Mm732xFajRbfbWukQtGkqG'

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

    // Trigger the CCR routine to run immediately
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const triggerRes = await fetch(
      `https://api.anthropic.com/v1/code/triggers/${TRIGGER_ID}/run`,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-code-20250219',
          'content-type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    )

    if (!triggerRes.ok) {
      const errBody = await triggerRes.text()
      console.error('[run-mandate] CCR trigger failed:', triggerRes.status, errBody)
      // Still return 200 to the client — the run stays PENDING and CCR will pick it up on next tick
      return NextResponse.json({
        ok: false,
        queued: true,
        message: `Could not trigger immediately (${triggerRes.status}), run will execute on next hourly tick.`,
        detail: errBody.slice(0, 200),
      })
    }

    const body = await triggerRes.json()
    return NextResponse.json({ ok: true, triggered: true, detail: body })
  } catch (err: any) {
    console.error('[run-mandate] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
