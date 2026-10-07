// GENERATED from @icos/pipedrive v0.1.0 — do not edit this copy.
// Source of truth: Icoscapital/icos-packages packages/pipedrive/src/index.ts
// Refresh: cd icos-packages && npm run vendor   (check: npm run vendor:check)

// @icos/pipedrive — the one Pipedrive client for Icos apps.
//
// Runs unchanged in Deno (Supabase edge functions, imported as a .ts file) and Node 18+. No
// dependencies. Replaces six hand-rolled clients (Vantage sync/push/fetch-deck/icos-summary,
// Herb, Fundraise MCP, emma-inbox, dropin, Emma) that each re-learned the same lessons:
//
//   * search endpoints (/deals/search, /organizations/search …) return 404 on api.pipedrive.com
//     and only answer on the company domain, so every call goes to <domain>.pipedrive.com;
//   * Pipedrive rate-limits with 429 + Retry-After — retry that, fail fast on anything else;
//   * a 200 can still carry success:false — check the envelope, not just the status;
//   * custom-field KEYS are hashes that change when a field is recreated (five were deleted and one
//     renamed between 2026-05 and 2026-07). Resolve by NAME through dealFieldMap() (Vantage rule 3).

export const VERSION = '0.1.0'

// ───────────────────────────── config ─────────────────────────────

export type Params = Record<string, string | number | boolean | null | undefined>

export type PipedriveOptions = {
  /** API token. Defaults to PIPEDRIVE_API_TOKEN, then PIPEDRIVE_TOKEN, from Deno.env or process.env. */
  token?: string
  /** Company subdomain. Defaults to PIPEDRIVE_DOMAIN / PIPEDRIVE_SUBDOMAIN, else 'icoscapital'. */
  domain?: string
  /** Attempts on 429 / 502 / 503 / 504. Default 4. */
  maxAttempts?: number
  /** Injected for tests. */
  fetch?: typeof fetch
}

// deno-lint-ignore no-explicit-any
const env = (name: string): string | undefined => (globalThis as any).Deno?.env?.get?.(name) ?? (globalThis as any).process?.env?.[name]

export function resolveToken(explicit?: string): string {
  const t = explicit ?? env('PIPEDRIVE_API_TOKEN') ?? env('PIPEDRIVE_TOKEN')
  if (!t) throw new Error('PIPEDRIVE_API_TOKEN is not set')
  return t.trim()
}

export function resolveDomain(explicit?: string): string {
  return (explicit ?? env('PIPEDRIVE_DOMAIN') ?? env('PIPEDRIVE_SUBDOMAIN') ?? 'icoscapital').trim()
}

export class PipedriveError extends Error {
  constructor(public status: number, public path: string, public body: string) {
    super(`Pipedrive ${status} on ${path}: ${body.slice(0, 300)}`)
    this.name = 'PipedriveError'
  }
}

// ───────────────────────────── Icos tenant facts ─────────────────────────────

/**
 * Icos's own Pipedrive configuration. Ids, not hashes: pipelines, stages and users keep their ids
 * when renamed. Still, re-check against /stages after any pipeline restructure — stage 6 silently
 * changed meaning on 2026-08-20 (Vantage CLAUDE.md).
 */
export const ICOS_PIPEDRIVE = {
  pipelineId: 9,                 // "Icos"
  stageDealsToDiscuss: 141,      // where inbound dropins land
  visibleToEntireCompany: 3,
  defaultOwnerUserId: 5523,      // Nityen
} as const

/** Custom deal fields, by the NAME Pipedrive shows. Resolve to a key with dealFieldMap(). */
export const DEAL_FIELD_NAMES = {
  website: 'Website',
  shortDescription: 'Short Description',
  city: 'City',
  businessStage: 'Business stage',
  cepInterest: 'CEP Interest',
  deckCleared: 'Cleared for CEP deck sharing',
  frameworkVerdict: 'Framework Verdict',
  investmentManager: 'Investment Manager',
  fundsRequired: 'Funds Required',
  chemicals: 'Chemicals & Materials',
  industry: 'Sustainable industry',
  food: 'Food Systems',
  decarb: 'Decarbonisation',
} as const

/** Option LABELS the apps key logic on. Resolve to an option id with FieldMap.optionId(). */
export const DEAL_OPTION_LABELS = {
  frameworkVerdictNoGo: 'No Go - Not a fit',
  investmentManagerNityen: 'Nityen Lal',
  investmentManagerPeter: 'Peter van Gelderen',
  investmentManagerKatarzyna: 'Katarzyna Gil',
} as const

// ───────────────────────────── field map ─────────────────────────────

export type Field = {
  key: string
  name: string
  field_type: string
  options?: { id: number; label: string }[]
  [k: string]: unknown
}

/** Name → key / option lookups over one /dealFields (or /organizationFields …) response. */
export class FieldMap {
  private byName = new Map<string, Field>()
  constructor(public readonly fields: Field[]) {
    for (const f of fields) this.byName.set(f.name.trim().toLowerCase(), f)
  }
  field(name: string): Field | null { return this.byName.get(name.trim().toLowerCase()) ?? null }
  keyOrNull(name: string): string | null { return this.field(name)?.key ?? null }
  /** Throws when the field is gone: a silent null here is how a renamed field drops out of a sync. */
  key(name: string): string {
    const k = this.keyOrNull(name)
    if (!k) throw new Error(`Pipedrive field "${name}" not found — renamed or deleted?`)
    return k
  }
  options(name: string): { id: number; label: string }[] { return this.field(name)?.options ?? [] }
  optionIdOrNull(name: string, label: string): number | null {
    const want = label.trim().toLowerCase()
    return this.options(name).find((o) => o.label.trim().toLowerCase() === want)?.id ?? null
  }
  optionId(name: string, label: string): number {
    const id = this.optionIdOrNull(name, label)
    if (id == null) throw new Error(`Pipedrive option "${label}" not found on field "${name}"`)
    return id
  }
  optionLabel(name: string, id: number | string): string | null {
    return this.options(name).find((o) => String(o.id) === String(id))?.label ?? null
  }
  /** Names in `wanted` that this account no longer has — surface them instead of syncing blanks. */
  missing(wanted: Iterable<string>): string[] { return [...wanted].filter((n) => !this.field(n)) }
}

// ───────────────────────────── client ─────────────────────────────

const RETRYABLE = new Set([429, 502, 503, 504])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class Pipedrive {
  readonly domain: string
  readonly base: string
  private token: string
  private f: typeof fetch
  private maxAttempts: number

  constructor(opts: PipedriveOptions = {}) {
    this.token = resolveToken(opts.token)
    this.domain = resolveDomain(opts.domain)
    this.base = `https://${this.domain}.pipedrive.com/api/v1`
    this.f = opts.fetch ?? fetch
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 4)
  }

  url(path: string, params: Params = {}): string {
    const u = new URL(this.base + path)
    u.searchParams.set('api_token', this.token)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v))
    return u.toString()
  }

  /** One call. Returns the parsed envelope ({ success, data, additional_data }). */
  // deno-lint-ignore no-explicit-any
  async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, { params = {}, body }: { params?: Params; body?: unknown } = {}): Promise<any> {
    const url = this.url(path, params)
    let last = ''
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const res = await this.f(url, {
        method,
        headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await res.text()
      if (RETRYABLE.has(res.status)) {
        last = `${res.status} ${text.slice(0, 200)}`
        if (attempt < this.maxAttempts) {
          const retryAfter = Number(res.headers.get('retry-after') ?? 0)
          await sleep(Math.min((retryAfter > 0 ? retryAfter * 1000 : 2000) * attempt, 20_000))
          continue
        }
        break
      }
      if (!res.ok) throw new PipedriveError(res.status, path, text)
      // deno-lint-ignore no-explicit-any
      let json: any
      try { json = JSON.parse(text) } catch { throw new PipedriveError(res.status, path, `non-JSON body: ${text.slice(0, 120)}`) }
      if (json?.success === false) throw new PipedriveError(res.status, path, text)
      return json
    }
    throw new PipedriveError(429, path, `gave up after ${this.maxAttempts} attempts — ${last}`)
  }

  // deno-lint-ignore no-explicit-any
  get(path: string, params: Params = {}): Promise<any> { return this.request('GET', path, { params }) }
  // deno-lint-ignore no-explicit-any
  post(path: string, body: unknown, params: Params = {}): Promise<any> { return this.request('POST', path, { params, body }) }
  // deno-lint-ignore no-explicit-any
  put(path: string, body: unknown, params: Params = {}): Promise<any> { return this.request('PUT', path, { params, body }) }
  // deno-lint-ignore no-explicit-any
  delete(path: string, params: Params = {}): Promise<any> { return this.request('DELETE', path, { params }) }

  /** Walk start/limit pagination to exhaustion and return the concatenated `data`. */
  // deno-lint-ignore no-explicit-any
  async all(path: string, params: Params = {}, { limit = 500 }: { limit?: number } = {}): Promise<any[]> {
    // deno-lint-ignore no-explicit-any
    const out: any[] = []
    let start = 0
    for (;;) {
      const body = await this.get(path, { ...params, limit, start })
      if (Array.isArray(body.data)) out.push(...body.data)
      const p = body.additional_data?.pagination
      if (!p?.more_items_in_collection) break
      start = p.next_start ?? start + limit
    }
    return out
  }

  // ── reference data ──
  async dealFields(): Promise<Field[]> { return (await this.get('/dealFields', { limit: 500 })).data ?? [] }
  async dealFieldMap(): Promise<FieldMap> { return new FieldMap(await this.dealFields()) }
  async organizationFieldMap(): Promise<FieldMap> { return new FieldMap((await this.get('/organizationFields', { limit: 500 })).data ?? []) }
  // deno-lint-ignore no-explicit-any
  async stages(pipelineId?: number): Promise<any[]> { return (await this.get('/stages', pipelineId ? { pipeline_id: pipelineId, limit: 500 } : { limit: 500 })).data ?? [] }
  /** stage id → "Pipeline: Stage", so a tool can say "Quickscan" instead of "stage 99". */
  async stageNames(): Promise<Record<number, string>> {
    const out: Record<number, string> = {}
    for (const s of await this.stages()) out[s.id] = s.pipeline_name ? `${s.pipeline_name}: ${s.name}` : s.name
    return out
  }
  // deno-lint-ignore no-explicit-any
  async users(): Promise<any[]> { return (await this.get('/users')).data ?? [] }

  // ── organizations ──
  // deno-lint-ignore no-explicit-any
  async searchOrganizations(term: string, { limit = 20, exact = false, fields }: { limit?: number; exact?: boolean; fields?: string } = {}): Promise<any[]> {
    const r = await this.get('/organizations/search', { term, limit, exact_match: exact, fields })
    // deno-lint-ignore no-explicit-any
    return (r.data?.items ?? []).map((i: any) => i.item)
  }
  // deno-lint-ignore no-explicit-any
  async getOrganization(id: number): Promise<any> { return (await this.get(`/organizations/${id}`)).data }
  // deno-lint-ignore no-explicit-any
  async createOrganization(body: Record<string, unknown>): Promise<any> { return (await this.post('/organizations', body)).data }
  // deno-lint-ignore no-explicit-any
  async updateOrganization(id: number, body: Record<string, unknown>): Promise<any> { return (await this.put(`/organizations/${id}`, body)).data }
  // deno-lint-ignore no-explicit-any
  async organizationDeals(orgId: number, { status = 'all_not_deleted', limit = 100 }: { status?: string; limit?: number } = {}): Promise<any[]> {
    return (await this.get(`/organizations/${orgId}/deals`, { status, limit })).data ?? []
  }

  // ── persons ──
  // deno-lint-ignore no-explicit-any
  async searchPersons(term: string, { limit = 20, fields }: { limit?: number; fields?: string } = {}): Promise<any[]> {
    const r = await this.get('/persons/search', { term, limit, fields })
    // deno-lint-ignore no-explicit-any
    return (r.data?.items ?? []).map((i: any) => i.item)
  }
  // deno-lint-ignore no-explicit-any
  async createPerson(body: Record<string, unknown>): Promise<any> { return (await this.post('/persons', body)).data }

  // ── deals ──
  // deno-lint-ignore no-explicit-any
  async searchDeals(term: string, { limit = 20 }: { limit?: number } = {}): Promise<any[]> {
    const r = await this.get('/deals/search', { term, limit })
    // deno-lint-ignore no-explicit-any
    return (r.data?.items ?? []).map((i: any) => i.item)
  }
  // deno-lint-ignore no-explicit-any
  async getDeal(id: number): Promise<any> { return (await this.get(`/deals/${id}`)).data }
  // deno-lint-ignore no-explicit-any
  async createDeal(body: Record<string, unknown>): Promise<any> {
    const d = (await this.post('/deals', body)).data
    if (!d?.id) throw new PipedriveError(200, '/deals', 'deal create returned no id')
    return d
  }
  /** Every deal matching `params` (status, stage_id, pipeline_id …), all pages. */
  // deno-lint-ignore no-explicit-any
  deals(params: Params = { status: 'all_not_deleted' }, limit = 500): Promise<any[]> { return this.all('/deals', params, { limit }) }

  // ── notes: Vantage rule 5 — write-back to Pipedrive is append-only notes, never fields ──
  /** Pipedrive notes are HTML; escape anything a person typed with escapeHtml() first. */
  // deno-lint-ignore no-explicit-any
  async addNote(target: { deal_id?: number; org_id?: number; person_id?: number }, content: string): Promise<any> {
    const n = (await this.post('/notes', { ...target, content })).data
    if (!n?.id) throw new PipedriveError(200, '/notes', 'note create returned no id')
    return n
  }
  // deno-lint-ignore no-explicit-any
  async updateNote(noteId: number, content: string): Promise<any> { return (await this.put(`/notes/${noteId}`, { content })).data }
  // deno-lint-ignore no-explicit-any
  async notes({ deal_id, org_id, person_id, limit = 10, sort = 'add_time DESC' }: { deal_id?: number; org_id?: number; person_id?: number; limit?: number; sort?: string }): Promise<any[]> {
    return (await this.get('/notes', { deal_id, org_id, person_id, limit: Math.min(limit, 500), sort })).data ?? []
  }

  // ── activities ──
  // deno-lint-ignore no-explicit-any
  async activities(params: Params = {}): Promise<any[]> { return (await this.get('/activities', { limit: 20, start: 0, ...params })).data ?? [] }
  // deno-lint-ignore no-explicit-any
  async addActivity(body: Record<string, unknown>): Promise<any> { return (await this.post('/activities', body)).data }

  // ── files ──
  /**
   * Raw download Response for a file. The caller must check `content-type`: Pipedrive has been
   * seen returning HTTP 200 with a JSON or HTML error body for a file it can no longer serve.
   */
  downloadFile(fileId: number | string): Promise<Response> { return this.f(this.url(`/files/${fileId}/download`)) }
  /** Email attachments live under the mailbox API, which only answers on the company domain. */
  downloadMailAttachment(attachmentId: number | string): Promise<Response> { return this.f(this.url(`/mailbox/mailAttachments/${attachmentId}/download`)) }

  // ── links ──
  dealUrl(id: number | string): string { return `https://${this.domain}.pipedrive.com/deal/${id}` }
  organizationUrl(id: number | string): string { return `https://${this.domain}.pipedrive.com/organization/${id}` }
  personUrl(id: number | string): string { return `https://${this.domain}.pipedrive.com/person/${id}` }
}

// ───────────────────────────── text helpers ─────────────────────────────

/** Pipedrive notes are HTML. Escape anything a person typed before putting it in one. */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Note bodies arrive as HTML, often double-escaped from auto-generated entries. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// ───────────────────────────── trims for LLM tools ─────────────────────────────
// Keep tool results small and on-message: verbose Pipedrive blobs confuse the model and waste tokens.

// deno-lint-ignore no-explicit-any
export function trimDeal(d: any, stageNames: Record<number, string> = {}) {
  const stageId = d.stage_id ?? d.stage?.id
  return {
    id: d.id, title: d.title, status: d.status,
    stage_id: stageId,
    stage_name: d.stage?.name ?? (stageId != null ? stageNames[stageId] : null) ?? null,
    value: d.value, currency: d.currency,
    org_name: d.org_name ?? d.organization?.name,
    person_name: d.person_name ?? d.person?.name,
    owner_name: d.owner_name ?? d.user_id?.name,
    update_time: d.update_time, last_activity_date: d.last_activity_date,
    next_activity_date: d.next_activity_date, expected_close_date: d.expected_close_date,
  }
}
// deno-lint-ignore no-explicit-any
export function trimOrganization(o: any) {
  return {
    id: o.id, name: o.name, web: o.web, address_country: o.address_country, address_city: o.address_city,
    owner_name: o.owner_name, open_deals_count: o.open_deals_count, update_time: o.update_time,
  }
}
// deno-lint-ignore no-explicit-any
export function trimPerson(p: any) {
  return {
    id: p.id, name: p.name,
    // deno-lint-ignore no-explicit-any
    email: (p.email ?? []).map((e: any) => e.value),
    org_name: p.org_name ?? p.organization?.name, update_time: p.update_time,
  }
}
// deno-lint-ignore no-explicit-any
export function trimNote(n: any) {
  return {
    id: n.id, content: stripHtml(n.content ?? '').slice(0, 1500),
    author: n.user?.name ?? n.user?.email ?? null, add_time: n.add_time,
    deal_id: n.deal_id, deal_title: n.deal?.title ?? null, org_name: n.organization?.name ?? null,
  }
}
// deno-lint-ignore no-explicit-any
export function trimActivity(a: any) {
  return {
    id: a.id, subject: a.subject, type: a.type, done: a.done, due_date: a.due_date, due_time: a.due_time,
    deal_id: a.deal_id, deal_title: a.deal_title,
    // Without this a model cannot tell whether the parent deal is still live (Emma once flagged a won deal as stale).
    deal_status: a.deal_status ?? a.deal?.status ?? null,
    org_name: a.org_name, person_name: a.person_name, user_id: a.user_id,
    note: a.note ? String(a.note).slice(0, 500) : null, add_time: a.add_time, update_time: a.update_time,
  }
}
