import { NextRequest, NextResponse } from 'next/server'
import { requireUser, serviceClient } from '@/lib/api-auth'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

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
      .select('*, herb_runs!inner(theme, user_id)')
      .eq('id', company_id)
      .single()
    if (error || !co) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    if ((co.herb_runs as any)?.user_id && (co.herb_runs as any).user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('[memo] Anthropic error:', res.status, errText.slice(0, 300))
      return NextResponse.json({ error: `Memo generation failed (${res.status})` }, { status: 502 })
    }
    const json = await res.json()
    const memo: string = json?.content?.[0]?.text?.trim() ?? ''
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
