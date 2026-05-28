import { NextRequest, NextResponse } from 'next/server'
import { requireRunOwner, serviceClient } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const { run_id, feedback_text, excluded_companies, attachments, override_instructions } = await req.json()
    if (!run_id) {
      return NextResponse.json({ error: 'run_id required' }, { status: 400 })
    }

    // Verify caller is authenticated AND owns the original run
    const owner = await requireRunOwner(req, run_id, '*')
    if (!owner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const orig = owner.run
    const sb = serviceClient()

    // Build the special instructions for the next round
    let round2Instructions: string | null
    if (override_instructions?.trim()) {
      // Full rewrite — use exactly what the user typed
      round2Instructions = override_instructions.trim()
    } else {
      const excludeClause = excluded_companies?.length
        ? `Exclude from results: ${excluded_companies.join(', ')}. `
        : ''
      const origInstructions = orig.special_instructions ? `Previous instructions: ${orig.special_instructions}. ` : ''
      const feedbackClause = feedback_text?.trim() ? `Round 2 feedback: ${feedback_text.trim()}` : ''
      round2Instructions = `${origInstructions}${excludeClause}${feedbackClause}`.trim() || null
    }

    // Determine round number from existing slug
    const slugBase = orig.slug.replace(/-r\d+$/, '')  // strip existing -r2, -r3 suffix
    const roundMatch = orig.slug.match(/-r(\d+)$/)
    const nextRound = roundMatch ? parseInt(roundMatch[1]) + 1 : 2
    const newSlug = `${slugBase}-r${nextRound}`.slice(0, 80)

    // Create round N run
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

    // Copy herb_files from the original run to the new run (pitchbook + company-list)
    // Global check-sites are not copied — they're referenced via is_global=true instead
    try {
      const { data: origFiles } = await sb
        .from('herb_files')
        .select('*')
        .eq('run_id', run_id)
        .eq('is_global', false)

      if (origFiles && origFiles.length > 0) {
        const copiedRows = origFiles.map((f: any) => ({
          user_id: f.user_id,
          run_id: newRun.id,
          slot_type: f.slot_type,
          name: f.name,
          url: f.url,
          path: f.path,
          size: f.size,
          is_global: false,
        }))
        await sb.from('herb_files').insert(copiedRows)
      }
    } catch (fileErr) {
      // Non-fatal — herb_files may not exist yet
      console.warn('[feedback] herb_files copy error (non-fatal):', fileErr)
    }

    return NextResponse.json({ ok: true, new_run_id: newRun.id, slug: newRun.slug })
  } catch (err: any) {
    console.error('[feedback] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
