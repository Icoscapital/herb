'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/api-client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Finding = {
  id: string
  pipedrive_deal_id: number | null
  company_name: string
  domain: string | null
  update_type: 'FUNDING' | 'COMPETITOR_FUNDING' | 'COMMERCIAL' | 'NEWS'
  headline: string
  detail: string | null
  source_url: string | null
  confidence: string | null
  acknowledged: boolean
  found_at: string
}

type LatestRun = {
  id: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'ERROR'
  terms: string | null
  company_count: number
  findings_count: number | null
  progress: string | null
  error_message: string | null
  created_at: string
  finished_at: string | null
} | null

// Read-only — every entry here is a live Pipedrive deal that qualifies
// automatically (stage + CEP Interest + Framework Verdict). There's no
// manual add/toggle any more.
type ScopedDeal = {
  pipedrive_deal_id: number
  company_name: string
  domain: string
  stage_name: string
}

const TYPE_CFG: Record<Finding['update_type'], { label: string; color: string; bg: string }> = {
  FUNDING:            { label: 'Funding',            color: 'var(--teal)', bg: 'var(--teal-light)' },
  COMPETITOR_FUNDING: { label: 'Competitor funding',  color: 'var(--navy)', bg: 'var(--navy-light)' },
  COMMERCIAL:         { label: 'Commercial update',   color: '#b8860b',     bg: '#fbf3de' },
  NEWS:                { label: 'News',                color: 'var(--muted)', bg: 'var(--bg)' },
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const PD_DOMAIN = 'icoscapital'

export default function WatchFollowPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [findings, setFindings] = useState<Finding[]>([])
  const [latestRun, setLatestRun] = useState<LatestRun>(null)
  const [scopedDeals, setScopedDeals] = useState<ScopedDeal[]>([])
  const [scopedLoading, setScopedLoading] = useState(true)
  const [showScope, setShowScope] = useState(false)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [terms, setTerms] = useState('')
  const router = useRouter()

  const loadFindings = useCallback(async () => {
    const res = await authedFetch('/api/watch-follow')
    const json = await res.json()
    if (json.findings) setFindings(json.findings)
    if ('latest_run' in json) {
      setLatestRun(prev => {
        // Surface a completion toast the moment a tracked run finishes.
        if (prev && (prev.status === 'PENDING' || prev.status === 'RUNNING') && json.latest_run?.id === prev.id) {
          if (json.latest_run.status === 'DONE') {
            setRunMsg({ text: `Check complete — ${json.latest_run.findings_count ?? 0} new finding(s)`, ok: true })
          } else if (json.latest_run.status === 'ERROR') {
            setRunMsg({ text: json.latest_run.error_message || 'Check failed', ok: false })
          }
        }
        return json.latest_run
      })
    }
  }, [])

  const loadScopedDeals = useCallback(async () => {
    setScopedLoading(true)
    try {
      const res = await authedFetch('/api/watch-follow/deals')
      const json = await res.json()
      if (json.deals) setScopedDeals(json.deals)
    } finally {
      setScopedLoading(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      loadFindings().then(() => setLoading(false))
    })
  }, [router, loadFindings])

  useEffect(() => {
    if (showScope && scopedDeals.length === 0) loadScopedDeals()
  }, [showScope, scopedDeals.length, loadScopedDeals])

  // Poll while a tick is in flight so the page reflects reality instead of
  // going quiet after the "Check now" click returns — the actual research
  // (run-watch-follow.yml) can run for several minutes.
  useEffect(() => {
    const active = latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING'
    const interval = active ? 8_000 : 30_000
    const t = setInterval(loadFindings, interval)
    return () => clearInterval(t)
  }, [loadFindings, latestRun?.status])

  /**
   * One story, seen from several companies, rendered once.
   *
   * A competitor raise is genuinely relevant to every company it competes with, so it is STORED per
   * company — dedupe is per (pipedrive_deal_id, dedupe_key), so each company keeps its own copy and
   * its own acknowledge state. But rendering it once per company made one €7.2M raise look like four
   * findings (2026-08-28: InsectBiotech against INVERTAPRO, MEALFOOD EUROPE, MICRONUTRIS and
   * PROTIFARM — 4 of that run's 5 findings).
   *
   * Grouped on source (falling back to the headline) rather than special-casing COMPETITOR_FUNDING:
   * a company's own funding news carries its own source and stays ungrouped naturally, and any other
   * shared story gets the same treatment for free.
   */
  const groups = useMemo(() => {
    const m = new Map<string, Finding[]>()
    for (const f of findings) {
      const key = `${f.update_type}|${(f.source_url || f.headline || '').trim().toLowerCase()}`
      const at = m.get(key)
      if (at) at.push(f)
      else m.set(key, [f])
    }
    return [...m.values()]
  }, [findings])

  /** Acknowledging a grouped story acknowledges every company's copy — they are one thing to read. */
  const acknowledgeGroup = async (g: Finding[]) => {
    const next = !g.every(f => f.acknowledged)
    const ids = new Set(g.map(f => f.id))
    setFindings(prev => prev.map(f => ids.has(f.id) ? { ...f, acknowledged: next } : f))
    await Promise.all(g.map(f =>
      authedFetch('/api/watch-follow', { method: 'PATCH', body: JSON.stringify({ id: f.id, acknowledged: next }) })))
  }

  const runNow = async () => {
    setRunning(true)
    setRunMsg(null)
    try {
      const res = await authedFetch('/api/watch-follow/run-now', {
        method: 'POST',
        body: JSON.stringify({ terms: terms.trim() || null }),
      })
      const json = await res.json()
      if (!json.ok) setRunMsg({ text: json.error || 'Could not start check', ok: false })
      // watch_follow_tick.py takes ~30-60s to resolve stages + qualify deals
      // + dispatch before herb_watch_follow_runs even exists; poll a few
      // times so the running banner appears promptly.
      setTimeout(loadFindings, 5_000)
      setTimeout(loadFindings, 15_000)
      setTimeout(loadFindings, 45_000)
    } catch (e: any) {
      setRunMsg({ text: String(e), ok: false })
    } finally {
      setRunning(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" style={{ width: '24px', height: '24px' }} />
    </div>
  )

  const unacknowledged = findings.filter(f => !f.acknowledged)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/icos-logo.svg" alt="Icos Capital" style={{ width: '88px', height: 'auto' }} />
            <div className="w-px h-6" style={{ background: 'var(--border)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--navy)' }}>Updates On Watch &amp; Follow</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--subtle)' }}>{user?.email}</span>
            <Link href="/dashboard" className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              &larr; Search log
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Updates On Watch &amp; Follow</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              Companies in scope are selected automatically &middot; checked on demand (no schedule) &middot; funding, competitor funding, commercial wins &amp; major news only
            </p>
            {/* When this was last actually checked. Without it a quiet feed is ambiguous — nothing
                found, or nothing run? — and "no news" only reassures if you know it is recent. */}
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              {latestRun ? (
                <>Last checked{' '}
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                    {new Date(latestRun.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {latestRun.terms ? ` · “${latestRun.terms}”` : ''}
                  {` · ${latestRun.company_count} compan${latestRun.company_count === 1 ? 'y' : 'ies'}`}
                  {latestRun.status === 'DONE'
                    ? `, ${latestRun.findings_count ?? 0} finding${latestRun.findings_count === 1 ? '' : 's'}`
                    : latestRun.status === 'ERROR' ? ' — that run failed' : ''}
                </>
              ) : 'Never checked.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Narrows WITHIN the standing criteria, never around them — a term can only shrink the
                set, so it cannot surface a deal the criteria excluded. */}
            <input
              value={terms}
              onChange={e => setTerms(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !running && latestRun?.status !== 'PENDING' && latestRun?.status !== 'RUNNING') runNow() }}
              placeholder="Narrow by keywords (optional)"
              title="Optional. Commas mean any of these; words without a comma must all appear. Leave blank to check every company in scope."
              className="text-xs px-3 py-1.5 rounded-lg outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', width: '230px' }}
            />
            <button onClick={runNow} disabled={running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING'}
              title={latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'A check is already running' : undefined}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all"
              style={{
                background: running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'var(--teal-light)' : 'var(--teal)',
                color: running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'var(--teal)' : '#fff',
              }}>
              {running ? <div className="loading-spinner" style={{ width: '10px', height: '10px', borderTopColor: 'var(--teal)' }} /> : '▶ Check now'}
            </button>
            <button onClick={() => setShowScope(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: showScope ? 'var(--navy-light)' : 'var(--surface)',
                color: showScope ? 'var(--navy)' : 'var(--subtle)',
                border: showScope ? '1px solid var(--navy)' : '1px solid var(--border)',
              }}>
              Currently in scope
            </button>
          </div>
        </div>

        {(latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING') && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'var(--teal-light)', color: 'var(--teal)', border: '1px solid var(--teal)' }}>
            <div className="loading-spinner" style={{ width: '14px', height: '14px', borderTopColor: 'var(--teal)', flexShrink: 0 }} />
            <span>
              {latestRun.status === 'PENDING'
                ? 'Check queued — GitHub Actions is spinning up…'
                : `Checking ${latestRun.company_count} compan${latestRun.company_count === 1 ? 'y' : 'ies'}${latestRun.terms ? ` matching “${latestRun.terms}”` : ''} for updates${latestRun.progress ? ` — ${latestRun.progress}` : '…'}`}
            </span>
          </div>
        )}

        {runMsg && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm"
            style={{
              background: runMsg.ok ? 'var(--teal-light)' : '#fdf2f1',
              color: runMsg.ok ? 'var(--teal)' : '#c0392b',
              border: `1px solid ${runMsg.ok ? 'var(--teal)' : '#e74c3c'}`,
            }}>
            <span>{runMsg.text}</span>
            <button onClick={() => setRunMsg(null)} style={{ opacity: 0.5, fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Read-only "currently in scope" list — no toggles, nothing to manage. */}
        {showScope && (
          <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                Selected automatically &mdash; Corporate view stage or later, CEP Interest flagged, not marked No Go, not won
              </span>
            </div>

            {scopedLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
              </div>
            ) : scopedDeals.length === 0 ? (
              <div className="text-xs py-8 text-center" style={{ color: 'var(--subtle)' }}>No deals currently qualify.</div>
            ) : (
              <div>
                {scopedDeals.map((d, i) => (
                  <div key={d.pipedrive_deal_id} className="grid items-center px-5 py-2.5"
                    style={{
                      gridTemplateColumns: '1fr 200px',
                      gap: '12px',
                      borderBottom: i < scopedDeals.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                    <div className="min-w-0">
                      <a href={`https://${PD_DOMAIN}.pipedrive.com/deal/${d.pipedrive_deal_id}`} target="_blank" rel="noreferrer"
                        className="text-sm font-medium truncate hover:underline" style={{ color: 'var(--text)' }}>
                        {d.company_name || `Deal #${d.pipedrive_deal_id}`}
                      </a>
                      {d.domain && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--subtle)' }}>{d.domain}</p>}
                    </div>
                    <span className="text-xs text-right" style={{ color: 'var(--subtle)' }}>{d.stage_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Findings feed */}
        {findings.length === 0 ? (
          <div className="rounded-2xl py-20 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-3xl mb-3">&#128225;</p>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No findings yet</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Companies in scope are selected automatically &mdash; nothing to toggle. Click &ldquo;Check now&rdquo; to run a check; there&rsquo;s no automatic schedule.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {groups.map((g, i) => {
              const f = g[0]
              const cfg = TYPE_CFG[f.update_type]
              // Acknowledged only once every company's copy is — a half-acknowledged group still
              // has something unread in it.
              const allAck = g.every(x => x.acknowledged)
              return (
                <div key={f.id} className="px-5 py-4"
                  style={{
                    borderBottom: i < groups.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: allAck ? 0.55 : 1,
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        {g.length === 1 ? (
                          f.pipedrive_deal_id ? (
                            <a href={`https://${PD_DOMAIN}.pipedrive.com/deal/${f.pipedrive_deal_id}`} target="_blank" rel="noreferrer"
                              className="text-xs font-medium hover:underline" style={{ color: 'var(--navy)' }}>
                              {f.company_name}
                            </a>
                          ) : (
                            <span className="text-xs font-medium" style={{ color: 'var(--navy)' }}>{f.company_name}</span>
                          )
                        ) : (
                          <span className="text-xs font-medium" style={{ color: 'var(--navy)' }}>{g.length} companies</span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--subtle)' }}>{timeAgo(f.found_at)}</span>
                      </div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{f.headline}</p>
                      {/* Name them, so a grouped story still says who it affects — each linked to
                          its own deal, since that is what someone acts on. */}
                      {g.length > 1 && (
                        <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                          Affects{' '}
                          {g.map((x, n) => (
                            <span key={x.id}>
                              {n > 0 && ', '}
                              {x.pipedrive_deal_id ? (
                                <a href={`https://${PD_DOMAIN}.pipedrive.com/deal/${x.pipedrive_deal_id}`} target="_blank" rel="noreferrer"
                                  className="hover:underline" style={{ color: 'var(--navy)' }}>{x.company_name}</a>
                              ) : x.company_name}
                            </span>
                          ))}
                        </p>
                      )}
                      {f.detail && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{f.detail}</p>}
                      {f.source_url && (
                        <a href={f.source_url} target="_blank" rel="noreferrer"
                          className="text-xs mt-1 inline-block hover:underline" style={{ color: 'var(--teal)' }}>
                          Source ↗
                        </a>
                      )}
                    </div>
                    <button onClick={() => acknowledgeGroup(g)}
                      title={allAck ? 'Mark unread' : 'Acknowledge'}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all shrink-0"
                      style={{
                        color: allAck ? 'var(--subtle)' : 'var(--teal)',
                        background: allAck ? 'var(--bg)' : 'var(--teal-light)',
                      }}>
                      {allAck ? 'Reopen' : 'Acknowledge'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs mt-5" style={{ color: 'var(--subtle)' }}>
          {unacknowledged.length} unacknowledged &middot; on-demand only, no schedule &middot; scope is selected automatically, nothing to toggle
        </p>
      </div>
    </div>
  )
}
