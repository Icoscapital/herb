import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

/**
 * Fast, synchronous preview of what a mandate will actually search for —
 * shown in a confirm dialog BEFORE any run is created or dispatched.
 *
 * Region + source-list-per-mode are computed deterministically here (same
 * rules as web_mandate_prompt.md's "Geography → regions" + source list) so
 * the preview can't drift from what the real run will do for those parts.
 * Only must_haves/exclusions/query_terms — extraction from free text — goes
 * through Claude, mirroring STEP 2.0 of the main mandate prompt.
 */

type Mode = 'COMPREHENSIVE' | 'EU_ONLY'

function regionsFor(mode: Mode, geography: string): string[] {
  if (mode === 'EU_ONLY') return ['EU']
  const g = (geography || '').toLowerCase()
  if (g.includes('europe') || g === 'eu') return ['EU']
  if (g.includes('japan') || g.includes('asia')) return ['JP']
  if (g.includes('usa') || g.includes('us') || g.includes('north america')) return ['US']
  return ['EU', 'JP', 'US']   // Global / blank / multi
}

function sourcesSummary(mode: Mode, exhaustive: boolean, hasSeeds: boolean): string {
  if (mode === 'EU_ONLY') {
    return 'Herb\'s own memory, Pipedrive CRM, Crunchbase, curated European VC portfolios, ' +
      'LinkedIn, X/Twitter, and European conferences (EIC Accelerator, Hello Tomorrow, EIT Food, Slush).'
  }
  const funds = exhaustive
    ? 'the FULL PitchBook universe — every matching fund, no cap (multi-hour run)'
    : 'the PitchBook universe — up to 250 most-relevant matching funds'
  const base = `Herb's own memory, Pipedrive CRM, Crunchbase, VC-fund discovery, ${funds} plus the curated ` +
    'roster, LinkedIn, X/Twitter, conferences, university tech-transfer offices, press, accelerator alumni, ' +
    'EU grants/CORDIS, patent mining, co-investor snowball, and non-English EU queries.'
  return hasSeeds ? base + ' Seed companies you named will also expand the search via their investors and conferences.' : base
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!ANTHROPIC_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const body = await req.json()
    const theme: string = (body.theme || '').trim()
    const specialInstructions: string = (body.special_instructions || '').trim()
    const mode: Mode = body.mode === 'EU_ONLY' ? 'EU_ONLY' : 'COMPREHENSIVE'
    const geography: string = body.geography || (mode === 'EU_ONLY' ? 'Europe' : 'Global')
    const stage: string = body.stage || 'Series A, Series B'
    const seedCompanies: string = (body.seed_companies || '').trim()
    const icosFit: boolean = !!body.icos_fit
    const includeSmall: boolean = !!body.include_small
    const exhaustive: boolean = !!body.exhaustive

    if (!theme) {
      return NextResponse.json({ error: 'theme required' }, { status: 400 })
    }

    const system = `You extract structured search criteria from a VC deal-sourcing mandate. Read the ENTIRE text — mandates are often one long sentence or a headline followed by several qualifying requirements, and every clause matters, not just the opening noun phrase.

Return ONLY valid JSON, no prose, no markdown fences:
{
  "query_terms": ["specific search term", ...],
  "must_haves": ["concrete checkable requirement", ...],
  "exclusions": ["thing explicitly ruled out", ...]
}

query_terms and must_haves are INDEPENDENT fields — do not let an empty must_haves talk you into an
empty query_terms. query_terms must ALWAYS contain 6-10 specific phrases, even for a short,
single-sentence, topic-only mandate with nothing extra qualifying it. Decompose the TOPIC itself —
technology/approach, sector(s), application, named geography — into distinct searchable phrases.
This field is almost never empty; only return [] if the mandate literally has no content.
  Example — mandate: "companies in the Netherlands focused on causal or predictive AI for industry,
  especially food or chemical sectors" -> query_terms: ["causal AI", "predictive AI industrial",
  "industrial AI Netherlands", "process AI food industry", "predictive maintenance chemical industry",
  "causal inference manufacturing", "food tech AI Netherlands", "chemical industry AI startup"]
  (Note this mandate has NO extra qualifying clauses beyond its topic, so must_haves = [] is correct
  for it — but query_terms is still fully populated. The two fields do not rise and fall together.)

must_haves: ONLY extra qualifying requirements stated BEYOND the core topic — a specific product
property, a business-model constraint, an explicit technical must-have. Return an empty array when
the mandate is just a topic description with nothing further qualifying it (the case above). Do not
invent requirements to fill this field, and do not empty query_terms just because this one is empty.
  Example WITH must_haves — mandate: "Find start-ups producing natural or bio-based hair colorants.
  These should give healthy hair from the root, work on any hair color/type, and bleach without
  damage." -> must_haves: ["natural/bio-based, not synthetic dye", "improves hair health from the
  root", "works across hair colors/types", "bleaches without damaging hair"]

exclusions: anything explicitly ruled out inline (e.g. "not already in our pipeline", "excluding consumer apps"). Empty array if none.`

    const userContent = [
      `Mandate: ${theme}`,
      specialInstructions && `Additional instructions: ${specialInstructions}`,
      seedCompanies && `Example companies already known to fit: ${seedCompanies}`,
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
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('[preview-plan] Anthropic error:', res.status, errText.slice(0, 300))
      return NextResponse.json({ error: `Plan extraction failed (${res.status})` }, { status: 502 })
    }
    const json = await res.json()
    const raw: string = json?.content?.[0]?.text?.trim() ?? '{}'
    let extracted: { must_haves?: string[]; exclusions?: string[]; query_terms?: string[] } = {}
    try {
      extracted = JSON.parse(raw.replace(/^```(json)?/i, '').replace(/```$/, '').trim())
    } catch (parseErr) {
      console.error('[preview-plan] JSON parse failed:', raw.slice(0, 300))
      return NextResponse.json({ error: 'Could not parse extracted plan' }, { status: 502 })
    }

    // Safety net: query_terms should never come back empty for a real mandate
    // (unlike must_haves, which is legitimately empty for plain-topic mandates).
    // If the model still zeroes it out, fall back to the theme's own significant
    // words rather than showing "no keywords" for a substantive request.
    if (!extracted.query_terms || extracted.query_terms.length === 0) {
      const STOPWORDS = new Set(['find', 'startups', 'startup', 'companies', 'company',
        'that', 'which', 'with', 'from', 'this', 'these', 'those', 'have', 'been',
        'their', 'they', 'especially', 'focused', 'looking', 'want', 'need', 'also',
        'other', 'some', 'such', 'more', 'most', 'about', 'into', 'across', 'over'])
      const words = `${theme} ${specialInstructions}`
        .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter(w => w.length >= 4 && !STOPWORDS.has(w))
      extracted.query_terms = Array.from(new Set(words)).slice(0, 8)
      console.warn('[preview-plan] model returned empty query_terms — used fallback:', extracted.query_terms)
    }

    const regions = regionsFor(mode, geography)

    return NextResponse.json({
      ok: true,
      mode,
      regions,
      stage,
      must_haves: extracted.must_haves ?? [],
      exclusions: extracted.exclusions ?? [],
      query_terms: extracted.query_terms ?? [],
      sources_summary: sourcesSummary(mode, exhaustive, !!seedCompanies),
      icos_fit: icosFit,
      include_small: includeSmall,
      exhaustive,
      seed_companies: seedCompanies || null,
    })
  } catch (err: any) {
    console.error('[preview-plan] error:', err)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
