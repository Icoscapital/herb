'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
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
  company_count: number
  findings_count: number | null
  progress: string | null
  error_message: string | null
  created_at: string
  finished_at: string | null
} | null

type Deal = {
  id: string | null
  pipedrive_deal_id: number | null
  company_name: string
  domain: string
  stage_id: number | null
  source: 'pipedrive' | 'manual'
  enabled: boolean
}

function dealKey(d: Deal): string {
  return d.id ?? `pd-${d.pipedrive_deal_id}`
}

const STAGE_LABEL: Record<number, string> = {
  139: 'Follow Up',
  145: 'Corporate Follow-up',
  144: 'Advanced Follow-up',
  100: 'PUR/DD/FIP',
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

export default function RadarPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [findings, setFindings] = useState<Finding[]>([])
  const [latestRun, setLatestRun] = useState<LatestRun>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [dealsLoading, setDealsLoading] = useState(true)
  const [showManage, setShowManage] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [adding, setAdding] = useState(false)
  const router = useRouter()

  const loadFindings = useCallback(async () => {
    const res = await authedFetch('/api/radar')
    const json = await res.json()
    if (json.findings) setFindings(json.findings)
    if ('latest_run' in json) {
      setLatestRun(prev => {
        // Surface a completion toast the moment a tracked run finishes.
        if (prev && (prev.status === 'PENDING' || prev.status === 'RUNNING') && json.latest_run?.id === prev.id) {
          if (json.latest_run.status === 'DONE') {
            setRunMsg({ text: `Check complete — ${json.latest_run.findings_count ?? 0} new finding(s)`, ok: true })
          } else if (json.latest_run.status === 'ERROR') {
            setRunMsg({ text: json.latest_run.error_message || 'Radar check failed', ok: false })
          }
        }
        return json.latest_run
      })
    }
  }, [])

  const loadDeals = useCallback(async () => {
    setDealsLoading(true)
    try {
      const res = await authedFetch('/api/radar/deals')
      const json = await res.json()
      if (json.deals) setDeals(json.deals)
    } finally {
      setDealsLoading(false)
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
    if (showManage && deals.length === 0) loadDeals()
  }, [showManage, deals.length, loadDeals])

  // Poll while a tick is in flight so the page reflects reality instead of
  // going quiet after the "Check now" click returns — the actual research
  // (run-update-radar.yml) can run for several minutes.
  useEffect(() => {
    const active = latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING'
    const interval = active ? 8_000 : 30_000
    const t = setInterval(loadFindings, interval)
    return () => clearInterval(t)
  }, [loadFindings, latestRun?.status])

  const toggleDeal = async (deal: Deal) => {
    const key = dealKey(deal)
    setToggling(key)
    const next = !deal.enabled
    setDeals(prev => prev.map(d => dealKey(d) === key ? { ...d, enabled: next } : d))
    try {
      await authedFetch('/api/radar/toggle', {
        method: 'POST',
        body: JSON.stringify(
          deal.id
            ? { id: deal.id, enabled: next }
            : {
                pipedrive_deal_id: deal.pipedrive_deal_id,
                enabled: next,
                company_name: deal.company_name,
                domain: deal.domain,
                stage_id: deal.stage_id,
              }
        ),
      })
    } finally {
      setToggling(null)
    }
  }

  const addCompany = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const res = await authedFetch('/api/radar/companies', {
        method: 'POST',
        body: JSON.stringify({ company_name: name, domain: newDomain.trim() }),
      })
      const json = await res.json()
      if (json.ok && json.company) {
        setDeals(prev => [{
          id: json.company.id,
          pipedrive_deal_id: null,
          company_name: json.company.company_name,
          domain: json.company.domain || '',
          stage_id: null,
          source: 'manual',
          enabled: json.company.enabled,
        }, ...prev])
        setNewName('')
        setNewDomain('')
      }
    } finally {
      setAdding(false)
    }
  }

  const acknowledge = async (id: string, acknowledged: boolean) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, acknowledged } : f))
    await authedFetch('/api/radar', { method: 'PATCH', body: JSON.stringify({ id, acknowledged }) })
  }

  const runNow = async () => {
    setRunning(true)
    setRunMsg(null)
    try {
      const res = await authedFetch('/api/radar/run-now', { method: 'POST' })
      const json = await res.json()
      if (!json.ok) setRunMsg({ text: json.error || 'Could not start check', ok: false })
      // radar_tick.py takes ~30-60s to sync + dispatch before herb_radar_runs
      // even exists; poll a few times so the running banner appears promptly.
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

  const enabledCount = deals.filter(d => d.enabled).length
  const unacknowledged = findings.filter(f => !f.acknowledged)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/icos-logo.svg" alt="Icos Capital" style={{ width: '88px', height: 'auto' }} />
            <div className="w-px h-6" style={{ background: 'var(--border)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--navy)' }}>Update Radar</span>
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
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Update Radar</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              {enabledCount} compan{enabledCount === 1 ? 'y' : 'ies'} watched &middot; checked on demand (no schedule) &middot; funding, competitor funding, commercial wins &amp; major news only
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runNow} disabled={running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING'}
              title={latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'A check is already running' : undefined}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all"
              style={{
                background: running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'var(--teal-light)' : 'var(--teal)',
                color: running || latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING' ? 'var(--teal)' : '#fff',
              }}>
              {running ? <div className="loading-spinner" style={{ width: '10px', height: '10px', borderTopColor: 'var(--teal)' }} /> : '▶ Check now'}
            </button>
            <button onClick={() => setShowManage(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: showManage ? 'var(--navy-light)' : 'var(--surface)',
                color: showManage ? 'var(--navy)' : 'var(--subtle)',
                border: showManage ? '1px solid var(--navy)' : '1px solid var(--border)',
              }}>
              Manage watch list
            </button>
          </div>
        </div>

        {(latestRun?.status === 'PENDING' || latestRun?.status === 'RUNNING') && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'var(--teal-light)', color: 'var(--teal)', border: '1px solid var(--teal)' }}>
            <div className="loading-spinner" style={{ width: '14px', height: '14px', borderTopColor: 'var(--teal)', flexShrink: 0 }} />
            <span>
              {latestRun.status === 'PENDING'
                ? 'Radar check queued — GitHub Actions is spinning up…'
                : `Checking ${latestRun.company_count} compan${latestRun.company_count === 1 ? 'y' : 'ies'} for updates${latestRun.progress ? ` — ${latestRun.progress}` : '…'}`}
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

        {/* Watch-list manager */}
        {showManage && (
          <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
                All deals in Follow Up &middot; Corporate/Advanced Follow-up &middot; PUR/DD/FIP are checked automatically &mdash; toggle off to exclude
              </span>
            </div>

            {/* Add a company with no Pipedrive deal */}
            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCompany() }}
                placeholder="Company name"
                className="text-sm px-3 py-1.5 rounded-lg outline-none flex-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCompany() }}
                placeholder="Domain (optional)"
                className="text-sm px-3 py-1.5 rounded-lg outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', width: '200px' }} />
              <button onClick={addCompany} disabled={adding || !newName.trim()}
                className="text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all shrink-0"
                style={{ background: 'var(--teal)', color: '#fff', opacity: adding || !newName.trim() ? 0.6 : 1 }}>
                {adding ? '…' : '+ Add company'}
              </button>
            </div>

            {dealsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="loading-spinner" style={{ width: '18px', height: '18px' }} />
              </div>
            ) : deals.length === 0 ? (
              <div className="text-xs py-8 text-center" style={{ color: 'var(--subtle)' }}>No open deals found in these stages.</div>
            ) : (
              <div>
                {deals.map((d, i) => (
                  <div key={dealKey(d)} className="grid items-center px-5 py-2.5"
                    style={{
                      gridTemplateColumns: '1fr 160px 60px',
                      gap: '12px',
                      borderBottom: i < deals.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                    <div className="min-w-0">
                      {d.source === 'pipedrive' ? (
                        <a href={`https://${PD_DOMAIN}.pipedrive.com/deal/${d.pipedrive_deal_id}`} target="_blank" rel="noreferrer"
                          className="text-sm font-medium truncate hover:underline" style={{ color: 'var(--text)' }}>
                          {d.company_name || `Deal #${d.pipedrive_deal_id}`}
                        </a>
                      ) : (
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{d.company_name}</span>
                      )}
                      {d.domain && <p className="text-xs truncate mt-0.5" style={{ color: 'var(--subtle)' }}>{d.domain}</p>}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                      {d.source === 'manual' ? 'Manual' : (STAGE_LABEL[d.stage_id ?? -1] ?? d.stage_id)}
                    </span>
                    <label className="flex justify-end items-center cursor-pointer">
                      <input type="checkbox" checked={d.enabled} disabled={toggling === dealKey(d)}
                        onChange={() => toggleDeal(d)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--teal)' }} />
                    </label>
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
              Deals are watched only once enabled below &mdash; toggle the ones you want checked, then click &ldquo;Check now&rdquo; to sync and check them. There&rsquo;s no automatic schedule; nothing runs until you click it.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {findings.map((f, i) => {
              const cfg = TYPE_CFG[f.update_type]
              return (
                <div key={f.id} className="px-5 py-4"
                  style={{
                    borderBottom: i < findings.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: f.acknowledged ? 0.55 : 1,
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        {f.pipedrive_deal_id ? (
                          <a href={`https://${PD_DOMAIN}.pipedrive.com/deal/${f.pipedrive_deal_id}`} target="_blank" rel="noreferrer"
                            className="text-xs font-medium hover:underline" style={{ color: 'var(--navy)' }}>
                            {f.company_name}
                          </a>
                        ) : (
                          <span className="text-xs font-medium" style={{ color: 'var(--navy)' }}>{f.company_name}</span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--subtle)' }}>{timeAgo(f.found_at)}</span>
                      </div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{f.headline}</p>
                      {f.detail && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{f.detail}</p>}
                      {f.source_url && (
                        <a href={f.source_url} target="_blank" rel="noreferrer"
                          className="text-xs mt-1 inline-block hover:underline" style={{ color: 'var(--teal)' }}>
                          Source ↗
                        </a>
                      )}
                    </div>
                    <button onClick={() => acknowledge(f.id, !f.acknowledged)}
                      title={f.acknowledged ? 'Mark unread' : 'Acknowledge'}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all shrink-0"
                      style={{
                        color: f.acknowledged ? 'var(--subtle)' : 'var(--teal)',
                        background: f.acknowledged ? 'var(--bg)' : 'var(--teal-light)',
                      }}>
                      {f.acknowledged ? 'Reopen' : 'Acknowledge'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-center text-xs mt-5" style={{ color: 'var(--subtle)' }}>
          {unacknowledged.length} unacknowledged &middot; checked on the 1st &amp; 15th of each month
        </p>
      </div>
    </div>
  )
}
