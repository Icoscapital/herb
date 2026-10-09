import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'
import { callClaude, textOf, logCall } from '@/lib/icos-llm'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!
const MODEL = 'claude-sonnet-5'

/**
 * IC one-pager: composes a partner-meeting-ready memo for one longlist
 * company from everything Herb already knows (description, deep-dive,
 * score rationale, Pipedrive status), returns structured markdown.
 * The client renders it in a printable view (print → PDF).
 */
export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json()
    if (!company_id) {
      return NextResponse.json({ error: 'company_id required' }, { status: 400 })
    }
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const sb = serviceClient()
    const { data: co, error } = await sb
      .from('herb_longlist')
      .select('*, herb_runs!inner(theme)')
      .eq('id', company_id)
      .single()
    if (error || !co) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const system = `You write one-page investment committee pre-memos for Icos Capital, a European deeptech VC (thesis: food/nutrition, specialty chemicals, advanced materials, industry AI, CCUS; strategic LPs: Nouryon, Bühler, FrieslandCampina).

Write in tight, factual prose a partner can absorb in 3 minutes. Use EXACTLY these markdown sections:
## What they do
## Team
## Traction & commercial evidence
## Investors & funding
## Icos fit
## Risks & open questions
## Sources

Rules: facts from the provided data only — never invent numbers, customers, or investors. Where the data is silent write "Not yet researched" rather than guessing. "Risks & open questions" must contain at least 3 concrete diligence questions. Keep the whole memo under 450 words.`

    const userContent = [
      `Search theme: ${(co.herb_runs as any)?.theme ?? ''}`,
      `Company: ${co.name}`,
      co.website && `Website: ${co.website}`,
      co.linkedin && `LinkedIn: ${co.linkedin}`,
      co.geography && `Geography: ${co.geography}`,
      co.stage && `Stage: ${co.stage}`,
      co.segment && `Segment: ${co.segment}`,
      co.score != null && `Icos Fit score: ${co.score}/10`,
      co.description && `Description: ${co.description}`,
      co.notes && `Search notes (incl. fit rationale, Pipedrive status, FTE): ${co.notes}`,
      co.deep_dive && `Deep-dive research:\n${co.deep_dive}`,
    ].filter(Boolean).join('\n')

    let memo = ''
    try {
      const r = await callClaude({ model: MODEL, maxTokens: 1200, system, messages: [{ role: 'user', content: userContent }] })
      memo = textOf(r.content)
      await logCall(sb, { app: 'herb', ref: `company:${company_id}`, kind: 'memo', model: r.model, usage: r.usage, stop_reason: r.stop_reason, ms: r.ms })
    } catch (e: any) {
      console.error('[memo] Anthropic error:', e?.status ?? '', String(e?.message ?? e).slice(0, 300))
      await logCall(sb, { app: 'herb', ref: `company:${company_id}`, kind: 'memo', model: MODEL, ok: false, error: String(e?.message ?? e) })
      return NextResponse.json({ error: `Memo generation failed (${e?.status ?? 'error'})` }, { status: 502 })
    }
    if (!memo) {
      return NextResponse.json({ error: 'Empty memo returned' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      memo,
      company: co.name,
      website: co.website,
      score: co.score,
      theme: (co.herb_runs as any)?.theme ?? '',
    })
  } catch (err: any) {
    console.error('[memo] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
