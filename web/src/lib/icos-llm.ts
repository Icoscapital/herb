// GENERATED from @icos/llm v0.1.0 — do not edit this copy.
// Source of truth: Icoscapital/icos-packages packages/llm/src/index.ts
// Refresh: cd icos-packages && npm run vendor   (check: npm run vendor:check)

// @icos/llm — the one way Icos apps call Claude.
//
// Runs unchanged in Deno (Supabase edge functions, imported as a .ts file) and in Node 18+
// (Next.js routes, Express). No dependencies: fetch, JSON and setTimeout only.
//
// Every call goes through callClaude() so that no code path can reach the Anthropic API
// without (a) a hard attempt cap and (b) a row in llm_call recording what it cost. That is
// deliberate: the emma-inbox retry storm was invisible until the invoice arrived.
//
// Raw HTTP rather than the Anthropic SDK on purpose: the apps need the server-side fallback
// beta, pause_turn resumption and attempt accounting under their own control, and a
// dependency-free file can be vendored into a Deno function directory as-is.

export const VERSION = '0.1.0'
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const ANTHROPIC_VERSION = '2023-06-01'

// ───────────────────────────── prices ─────────────────────────────

export type Price = { in: number; out: number }

/**
 * USD per million tokens, Anthropic first-party API, as of 2026-10-07. Stored on each llm_call
 * row so historic rows keep the price they were billed at. Cache reads are costed at 0.1x input
 * and cache writes at 1.25x input (see costUsd and sql/llm_call.sql — keep the two in step).
 * Web searches are $10 per 1,000.
 */
export const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { in: 10, out: 50 },
  'claude-fable-5': { in: 10, out: 50 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/** Exact match first, then the longest known id the served model name starts with. */
export function priceFor(model: string): Price | null {
  if (PRICES[model]) return PRICES[model]
  let best: string | null = null
  for (const k of Object.keys(PRICES)) {
    if (model.startsWith(k) && (!best || k.length > best.length)) best = k
  }
  return best ? PRICES[best] : null
}

// ───────────────────────────── types ─────────────────────────────

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  server_tool_use?: { web_search_requests?: number }
}

// Content blocks are kept loose on purpose: the apps read text, tool_use and server-tool
// result blocks, and new block types must pass through untouched.
// deno-lint-ignore no-explicit-any
export type ContentBlock = { type: string; [k: string]: any }

export type MessageParam = {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
  [k: string]: unknown
}

export type ToolDef = { name: string; [k: string]: unknown }

export type SystemPrompt = string | { type: 'text'; text: string; cache_control?: unknown }[]

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type CallOpts = {
  model: string
  messages: MessageParam[]
  maxTokens: number
  system?: SystemPrompt
  effort?: Effort
  tools?: ToolDef[]
  /** JSON Schema for a guaranteed-shape response (output_config.format = json_schema). */
  jsonSchema?: Record<string, unknown>
  /** A ready-made output_config.format object, e.g. from the SDK's zodOutputFormat(). Wins over jsonSchema. */
  outputFormat?: { type: string; [k: string]: unknown }
  /**
   * 'adaptive' turns thinking on explicitly — needed on Opus 4.x and Sonnet, where omitting the
   * parameter means no thinking. Dropped automatically on Fable, which has thinking always on.
   */
  thinking?: 'adaptive'
  /**
   * Server-side refusal fallback. A list of model ids (beta server-side-fallback-2026-06-01) or
   * 'default' (beta server-side-fallback-2026-07-01, routes by refusal category). The beta
   * header is added for you.
   */
  fallbacks?: string[] | 'default'
  betas?: string[]
  /** Anything else to put on the request body verbatim. Prefer a named option. */
  extraBody?: Record<string, unknown>
  /** Defaults to ANTHROPIC_API_KEY from Deno.env or process.env. */
  apiKey?: string
  /** Total attempts including the first. Default 3. Only 408/409/429/5xx and network errors retry. */
  maxAttempts?: number
  /** Longest single wait between attempts, ms. Default 20s: a long sleep inside an edge isolate burns the wall clock we need for work. */
  maxWaitMs?: number
  signal?: AbortSignal
  /** Injected for tests. */
  fetch?: typeof fetch
}

export type ClaudeResult = {
  content: ContentBlock[]
  stop_reason: string | null
  stop_details: { category?: string | null; explanation?: string | null } | null
  usage: Usage
  /** The model that actually answered — differs from the request after a server-side fallback. */
  model: string
  ms: number
  /** HTTP attempts this result cost (1 = first try succeeded). */
  attempts: number
}

/** A refusal comes back HTTP 200 with stop_reason 'refusal'. Never retried: the same question gets the same answer. */
export class RefusalError extends Error {
  constructor(public category: string | null | undefined, public result: ClaudeResult) {
    super(`request refused by safety classifiers${category ? ` (${category})` : ''}`)
    this.name = 'RefusalError'
  }
}

export class AnthropicHttpError extends Error {
  constructor(public status: number, public body: string, message?: string) {
    super(message ?? `HTTP ${status} from Anthropic: ${body.slice(0, 600)}`)
    this.name = 'AnthropicHttpError'
  }
}

// ───────────────────────────── auth ─────────────────────────────

export function resolveApiKey(explicit?: string): string {
  if (explicit) return explicit
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any
  const key: string | undefined = g.Deno?.env?.get?.('ANTHROPIC_API_KEY') ?? g.process?.env?.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set')
  return key
}

/**
 * Anthropic accepts two credential shapes on different headers, and sending one on the other's
 * header fails as `invalid x-api-key` — which reads like a bad key rather than a wrong header:
 *   sk-ant-api…  → x-api-key
 *   sk-ant-oat…  → Authorization: Bearer + the oauth-2025-04-20 beta
 * Whitespace from a paste is also a silent 401, hence the trim.
 */
function authHeaders(raw: string): { headers: Record<string, string>; beta?: string } {
  const key = raw.trim()
  if (key.startsWith('sk-ant-oat')) {
    return { headers: { Authorization: `Bearer ${key}` }, beta: 'oauth-2025-04-20' }
  }
  return { headers: { 'x-api-key': key } }
}

/** Public prefix + length only — enough to tell a wrong key shape from a wrong key. */
function keyShape(raw: string): string {
  const key = raw.trim()
  return `${key.slice(0, 11)}… (${key.length} chars` +
    `${key.length !== raw.length ? `, ${raw.length - key.length} stripped as whitespace` : ''})`
}

// ───────────────────────────── one call ─────────────────────────────

const RETRYABLE = new Set([408, 409, 429])
const isFable = (model: string) => model.startsWith('claude-fable') || model.startsWith('claude-mythos')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function buildBody(opts: CallOpts): { body: Record<string, unknown>; betas: string[] } {
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    messages: opts.messages,
  }
  if (opts.system !== undefined) body.system = opts.system
  if (opts.tools) body.tools = opts.tools

  const oc: Record<string, unknown> = {}
  if (opts.effort) oc.effort = opts.effort
  const format = opts.outputFormat ?? (opts.jsonSchema ? { type: 'json_schema', schema: opts.jsonSchema } : undefined)
  if (format) oc.format = format
  if (Object.keys(oc).length) body.output_config = oc

  // Fable rejects an explicit thinking config (thinking is always on there); Opus 4.x and
  // Sonnet run without thinking unless asked. One place knows this instead of six.
  if (opts.thinking === 'adaptive' && !isFable(opts.model)) body.thinking = { type: 'adaptive' }

  const betas = new Set(opts.betas ?? [])
  if (opts.fallbacks === 'default') {
    body.fallbacks = 'default'
    betas.add('server-side-fallback-2026-07-01')
  } else if (Array.isArray(opts.fallbacks) && opts.fallbacks.length) {
    body.fallbacks = opts.fallbacks.map((model) => ({ model }))
    betas.add('server-side-fallback-2026-06-01')
  }
  if (opts.extraBody) Object.assign(body, opts.extraBody)
  return { body, betas: [...betas] }
}

/**
 * One Claude call. Retries only on 408/409/429/5xx and network errors, up to maxAttempts
 * (default 3) with backoff — never on another 4xx and never on a refusal. A refusal throws
 * RefusalError so the caller records it and moves on instead of re-asking the same question.
 *
 * Note on structured output: output_config.format is not combined with server tools in the
 * same call. Run research (tools, no schema) and extraction (schema, no tools) as two calls.
 */
export async function callClaude(opts: CallOpts): Promise<ClaudeResult> {
  const key = resolveApiKey(opts.apiKey)
  const f = opts.fetch ?? fetch
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  const maxWaitMs = opts.maxWaitMs ?? 20_000
  const { body, betas } = buildBody(opts)
  const auth = authHeaders(key)
  if (auth.beta) betas.push(auth.beta)
  const headers: Record<string, string> = {
    ...auth.headers,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  }
  if (betas.length) headers['anthropic-beta'] = betas.join(',')
  const payload = JSON.stringify(body)

  const t0 = Date.now()
  let lastErr = ''
  let lastStatus = 0
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response
    try {
      res = await f(ANTHROPIC_URL, { method: 'POST', headers, body: payload, signal: opts.signal })
    } catch (e) {
      if (opts.signal?.aborted) throw e
      lastErr = `network: ${String((e as Error)?.message ?? e).slice(0, 300)}`
      if (attempt < maxAttempts) { await sleep(Math.min(2000 * attempt ** 2, maxWaitMs)); continue }
      break
    }

    // A 401 is never retryable, and the default message ("invalid x-api-key") points at the wrong
    // thing when the real problem is the credential's shape. Say which shape arrived.
    if (res.status === 401 || res.status === 403) {
      throw new AnthropicHttpError(res.status, await res.text(),
        `HTTP ${res.status} from Anthropic\n` +
        `  key as stored: ${keyShape(key)}\n` +
        `  sent on: ${auth.beta ? 'Authorization: Bearer (+oauth beta)' : 'x-api-key'}\n` +
        `  an sk-ant-api… key belongs on x-api-key; an sk-ant-oat… token on Authorization: Bearer.`)
    }

    if (RETRYABLE.has(res.status) || res.status >= 500) {
      lastStatus = res.status
      lastErr = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
      if (attempt < maxAttempts) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 0)
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt ** 2
        await sleep(Math.min(waitMs, maxWaitMs))
        continue
      }
      break
    }

    const text = await res.text()
    if (!res.ok) throw new AnthropicHttpError(res.status, text)

    const json = JSON.parse(text)
    const out: ClaudeResult = {
      content: json.content ?? [],
      stop_reason: json.stop_reason ?? null,
      stop_details: json.stop_details ?? null,
      usage: json.usage ?? {},
      model: json.model ?? opts.model,
      ms: Date.now() - t0,
      attempts: attempt,
    }
    // Check stop_reason before reading content: a refusal returns HTTP 200 with empty content.
    if (out.stop_reason === 'refusal') throw new RefusalError(out.stop_details?.category, out)
    return out
  }
  throw new AnthropicHttpError(lastStatus, lastErr, `gave up after ${maxAttempts} attempts — ${lastErr}`)
}

// ───────────────────────────── multi-segment runs ─────────────────────────────

export type RunResult = ClaudeResult & {
  /** Number of HTTP responses stitched together (1 = no pause_turn). */
  segments: number
}

/**
 * A server-side tool loop (web search, web fetch) can pause with stop_reason 'pause_turn';
 * the caller resumes by echoing the assistant turn back. This does that, up to
 * maxContinuations resumes, and returns the content of all segments in order with summed usage.
 * A refusal in any segment throws RefusalError whose .result carries everything spent so far.
 */
export async function runToCompletion(
  opts: CallOpts,
  { maxContinuations = 5 }: { maxContinuations?: number } = {},
): Promise<RunResult> {
  const t0 = Date.now()
  const content: ContentBlock[] = []
  let usage: Usage = {}
  let attempts = 0
  let segments = 0
  let messages = opts.messages
  for (;;) {
    let r: ClaudeResult
    try {
      r = await callClaude({ ...opts, messages })
    } catch (e) {
      if (e instanceof RefusalError) {
        e.result = {
          ...e.result,
          content: [...content, ...e.result.content],
          usage: sumUsage(usage, e.result.usage),
          attempts: attempts + e.result.attempts,
          ms: Date.now() - t0,
        }
      }
      throw e
    }
    segments++
    attempts += r.attempts
    usage = sumUsage(usage, r.usage)
    content.push(...r.content)
    if (r.stop_reason !== 'pause_turn') {
      return { ...r, content, usage, attempts, ms: Date.now() - t0, segments }
    }
    if (segments > maxContinuations) {
      throw new Error(`model paused ${segments} times in a server-side tool loop — gave up`)
    }
    messages = [...opts.messages, { role: 'assistant', content: r.content }]
  }
}

export type ToolHandler = (name: string, input: unknown, id: string) => unknown | Promise<unknown>

export type ToolLoopResult = {
  /** The last response, or null when the turn cap was hit. */
  final: ClaudeResult | null
  /** Text of the final response ('' when capped). */
  text: string
  /** Full transcript including tool results — append-only, safe to persist. */
  messages: MessageParam[]
  usage: Usage
  turns: number
  capped: boolean
  calls: ClaudeResult[]
}

/**
 * Client-side tool loop: user → Claude → (tool_use → runTool → tool_result → Claude) × N → text.
 * Hard-capped at maxTurns calls so a confused model cannot spin. Every tool_use block in a turn
 * is answered in one user message (parallel tools), and a thrown handler becomes an is_error
 * tool_result so the model can recover. Results are clipped to resultMaxChars.
 */
export async function runToolLoop(
  opts: CallOpts,
  runTool: ToolHandler,
  { maxTurns = 5, resultMaxChars = 4000 }: { maxTurns?: number; resultMaxChars?: number } = {},
): Promise<ToolLoopResult> {
  const messages: MessageParam[] = [...opts.messages]
  let usage: Usage = {}
  const calls: ClaudeResult[] = []
  for (let turn = 1; turn <= maxTurns; turn++) {
    const r = await callClaude({ ...opts, messages })
    calls.push(r)
    usage = sumUsage(usage, r.usage)
    messages.push({ role: 'assistant', content: r.content })
    if (r.stop_reason === 'pause_turn') continue
    if (r.stop_reason !== 'tool_use') {
      return { final: r, text: textOf(r.content), messages, usage, turns: turn, capped: false, calls }
    }
    const results: ContentBlock[] = []
    for (const b of r.content) {
      if (b.type !== 'tool_use') continue
      try {
        const out = await runTool(b.name, b.input, b.id)
        const content = typeof out === 'string' ? out : JSON.stringify(out ?? null)
        results.push({ type: 'tool_result', tool_use_id: b.id, content: content.slice(0, resultMaxChars) })
      } catch (e) {
        results.push({
          type: 'tool_result', tool_use_id: b.id, is_error: true,
          content: `Error: ${String((e as Error)?.message ?? e).slice(0, 300)}`,
        })
      }
    }
    messages.push({ role: 'user', content: results })
  }
  return { final: null, text: '', messages, usage, turns: maxTurns, capped: true, calls }
}

// ───────────────────────────── reading results ─────────────────────────────

/** Concatenated text of every text block, in order. */
export function textOf(content: ContentBlock[]): string {
  return content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n').trim()
}

/**
 * The JSON object in a response. With output_config.format the document is the trailing text
 * block, but a pause_turn can split it across segments and a model without a schema may wrap it
 * in prose or a code fence — so several reconstructions are tried, largest-last. `check`
 * rejects a parse that is valid JSON but not the shape wanted (e.g. an empty scores array).
 */
// deno-lint-ignore no-explicit-any
export function jsonOf<T = any>(content: ContentBlock[], check?: (x: any) => boolean): T | null {
  const texts = content.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string)
  const joined = texts.join('')
  const firstBrace = joined.indexOf('{')
  const lastObj = joined.lastIndexOf('{"')
  const candidates = [
    texts[texts.length - 1] ?? '',
    texts.slice(-2).join(''),
    firstBrace >= 0 ? joined.slice(firstBrace) : '',
    lastObj >= 0 ? joined.slice(lastObj) : '',
    (joined.match(/\{[\s\S]*\}/) ?? [''])[0],
    joined.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''),
  ]
  let first: T | null = null
  for (const c of candidates) {
    if (!c) continue
    try {
      const p = JSON.parse(c)
      if (!p || typeof p !== 'object') continue
      if (!check || check(p)) return p as T
      first ??= p as T
    } catch { /* next candidate */ }
  }
  return check ? null : first
}

export function sumUsage(a: Usage, b: Usage): Usage {
  const n = (x?: number) => x ?? 0
  return {
    input_tokens: n(a.input_tokens) + n(b.input_tokens),
    output_tokens: n(a.output_tokens) + n(b.output_tokens),
    cache_read_input_tokens: n(a.cache_read_input_tokens) + n(b.cache_read_input_tokens),
    cache_creation_input_tokens: n(a.cache_creation_input_tokens) + n(b.cache_creation_input_tokens),
    server_tool_use: {
      web_search_requests: n(a.server_tool_use?.web_search_requests) + n(b.server_tool_use?.web_search_requests),
    },
  }
}

/** USD for one call: cache reads at 0.1x input, cache writes at 1.25x input, searches $0.01 each. Mirrors sql/llm_call.sql. */
export function costUsd(model: string, u: Usage): number {
  const p = priceFor(model) ?? { in: 0, out: 0 }
  const n = (x?: number) => x ?? 0
  return (
    (n(u.input_tokens) + n(u.cache_creation_input_tokens) * 1.25) * p.in +
    n(u.output_tokens) * p.out +
    n(u.cache_read_input_tokens) * p.in * 0.1
  ) / 1e6 + n(u.server_tool_use?.web_search_requests) * 0.01
}

/** One-line spend summary for a UI footer: "123k in (45k cached) · 2.1k out · 3 searches · ~$0.42". */
export function usageNote(model: string, u: Usage): string {
  const n = (x?: number) => x ?? 0
  const k = (x: number, d = 0) => `${(x / 1000).toFixed(d)}k`
  const searches = n(u.server_tool_use?.web_search_requests)
  return `${k(n(u.input_tokens) + n(u.cache_read_input_tokens) + n(u.cache_creation_input_tokens))} in ` +
    `(${k(n(u.cache_read_input_tokens))} cached) · ${k(n(u.output_tokens), 1)} out` +
    `${searches ? ` · ${searches} searches` : ''} · ~$${costUsd(model, u).toFixed(2)}`
}

// ───────────────────────────── cost log ─────────────────────────────

export type LogRow = {
  /** Which app: 'vantage' | 'compass' | 'herb' | 'fundraise' | 'lp' … */
  app: string
  /** What the call was about, for grouping: 'deal:123', 'company:45', 'upload:9'. */
  ref?: string | null
  /** What kind of call: 'fit', 'summary', 'ai_suggest', 'memo' … */
  kind: string
  phase?: string | null
  model: string
  usage?: Usage
  stop_reason?: string | null
  ms?: number
  ok?: boolean
  error?: string | null
  /** App-specific columns to add to the row (Vantage keeps deal_id). */
  extra?: Record<string, unknown>
}

/** Minimal shape of a supabase-js client — avoids a dependency on the package. */
export type DbLike = {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> }
}

/**
 * Record one call in llm_call. Never throws — a logging failure must not lose generated work.
 * Pass the usage from a RunResult or a ToolLoopResult to log a whole run as one row.
 */
export async function logCall(db: DbLike, row: LogRow): Promise<void> {
  try {
    const u = row.usage ?? {}
    const price = priceFor(row.model)
    if (!price) console.warn(`llm_call: no price on file for model ${row.model} — logged at 0`)
    const p = price ?? { in: 0, out: 0 }
    const { error } = await db.from('llm_call').insert({
      app: row.app,
      ref: row.ref ?? null,
      kind: row.kind,
      phase: row.phase ?? null,
      model: row.model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      web_searches: u.server_tool_use?.web_search_requests ?? 0,
      price_in_per_mtok: p.in,
      price_out_per_mtok: p.out,
      stop_reason: row.stop_reason ?? null,
      ms: row.ms ?? null,
      ok: row.ok ?? true,
      error: row.error ? String(row.error).slice(0, 800) : null,
      ...(row.extra ?? {}),
    })
    if (error) console.error('llm_call insert failed (work is still saved):', error.message)
  } catch (e) {
    console.error('llm_call insert threw (work is still saved):', String((e as Error)?.message ?? e))
  }
}
