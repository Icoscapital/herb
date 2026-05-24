import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { run_id, feedback_text, excluded_companies, attachments } = await req.json()
    if (!run_id) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    const sb = createClient(SB_URL, SB_KEY)

    // Fetch the original run
    const { data: orig, error: fetchErr } = await sb
      .from('herb_runs')
      .select('*')
      .eq('id', run_id)
      .single()

    if (fetchErr || !orig) {
      return NextResponse.json({ error: 'Original run not found' }, { status: 404 })
    }

    // Build the special instructions for round 2
    const excludeClause = excluded_companies?.length
      ? `Exclude from results: ${excluded_companies.join(', ')}. `
      : ''
    const origInstructions = orig.special_instructions ? `Previous instructions: ${orig.special_instructions}. ` : ''
    const feedbackClause = feedback_text?.trim() ? `Round 2 feedback: ${feedback_text.trim()}` : ''
    const round2Instructions = `${origInstructions}${excludeClause}${feedbackClause}`.trim() || null

    // Determine round number from existing slug
    const slugBase = orig.slug.replace(/-r\d+$/, '')  // strip existing -r2, -r3 suffix
    const roundMatch = orig.slug.match(/-r(\d+)$/)
    const nextRound = roundMatch ? parseInt(roundMatch[1]) + 1 : 2
    const newSlug = `${slugBase}-r${nextRound}`.slice(0, 80)

    // Create round 2 run
    const { data: newRun, error: insertErr } = await sb
      .from('herb_runs')
      .insert({
        user_id: orig.user_id,
        theme: orig.theme,
        geography: orig.geography,
        stage: orig.stage,
        search_mode: orig.search_mode,
        special_instructions: round2Instructions,
        submitted_by_email: orig.submitted_by_email,
        submitted_by_name: orig.submitted_by_name,
        attachments: attachments ?? null,
        slug: newSlug,
        status: 'PENDING',
        current_round: nextRound,
        created_at: new Date().toISOString(),
      })
      .select('id, slug')
      .single()

    if (insertErr || !newRun) {
      console.error('[feedback] insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to create round 2 run' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, new_run_id: newRun.id, slug: newRun.slug })
  } catch (err: any) {
    console.error('[feedback] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
