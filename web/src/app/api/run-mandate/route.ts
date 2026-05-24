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

    // Try to trigger the CCR routine immediately via claude.ai API
    // Falls back gracefully — the hourly tick will pick up PENDING runs regardless
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey) {
      try {
        // CCR routines are managed by claude.ai — try both auth styles
        const triggerRes = await fetch(
          `https://claude.ai/api/v1/code/triggers/${TRIGGER_ID}/run`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'claude-code-20250219',
              'content-type': 'application/json',
            },
            body: JSON.stringify({}),
          }
        )
        if (triggerRes.ok) {
          const body = await triggerRes.json()
          console.log('[run-mandate] CCR triggered immediately:', triggerRes.status)
          return NextResponse.json({ ok: true, triggered: true, detail: body })
        }
        const errBody = await triggerRes.text()
        console.warn('[run-mandate] CCR trigger attempt failed:', triggerRes.status, errBody.slice(0, 200))
      } catch (triggerErr: any) {
        console.warn('[run-mandate] CCR trigger fetch error (non-fatal):', triggerErr?.message)
      }
    }

    // Could not trigger immediately — run stays PENDING, hourly CCR will pick it up
    return NextResponse.json({
      ok: true,
      queued: true,
      message: 'Queued — search will start on the next hourly tick.',
    })
  } catch (err: any) {
    console.error('[run-mandate] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
