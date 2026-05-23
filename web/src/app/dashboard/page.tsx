'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Run = {
  id: string; theme: string; status: string
  geography: string; stage: string; search_mode: string
  created_at: string
  submitted_by_email: string | null; submitted_by_name: string | null
  result_count: number | null; duration_seconds: number | null
  error_message: string | null
  progress: string | null; last_heartbeat: string | null
}

type Filter = 'all' | 'running' | 'done' | 'error'

function minutesSince(iso: string | null) {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 60000
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

// Status display config using Icos brand colors
const STATUS_CFG: Record<string, { label: string; dotColor: string; textColor: string; bgColor: string; pulse: boolean }> = {
  PENDING:   { label: 'Queued',       dotColor: 'var(--navy)', textColor: 'var(--navy)', bgColor: 'var(--navy-light)', pulse: false },
  SEARCHING: { label: 'Searching',    dotColor: 'var(--teal)', textColor: 'var(--teal)', bgColor: 'var(--teal-light)', pulse: true  },
  DONE:      { label: 'Complete',     dotColor: 'var(--teal)', textColor: 'var(--teal)', bgColor: 'var(--teal-light)', pulse: false },
  EMAILED:   { label: 'Results sent', dotColor: 'var(--teal)', textColor: 'var(--teal)', bgColor: 'var(--teal-light)', pulse: false },
  ERROR:     { label: 'Failed',       dotColor: '#c0392b', textColor: '#c0392b', bgColor: '#fdf2f1', pulse: false },
}

async function downloadCSV(runId: string, theme: string) {
  const { data } = await supabase
    .from('herb_longlist').select('*').eq('run_id', runId).order('score', { ascending: false })
  if (!data || data.length === 0) { alert('No results to download yet.'); return }
  const cols = ['name', 'description', 'website', 'linkedin', 'stage', 'geography', 'score', 'source', 'notes'] as const
  const headers = ['Company', 'Description', 'Website', 'LinkedIn', 'Stage', 'Geography', 'Score', 'Source', 'Notes']
  const rows = data.map((c: any) => cols.map(k => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','))
  const csv = '﻿' + [headers.join(','), ...rows].join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
    download: `herb-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`,
  })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

export default function LogPage() {
  const [runs, setRuns] = useState<Run[]>([])
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [downloading, setDownloading] = useState<string | null>(null)
  const router = useRouter()

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('herb_runs')
      .select('id,theme,status,geography,stage,search_mode,created_at,submitted_by_email,submitted_by_name,result_count,duration_seconds,error_message,progress,last_heartbeat')
      .order('created_at', { ascending: false })
      .limit(100)
    if (data) setRuns(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      load().then(() => setLoading(false))
    })
  }, [router, load])

  // Refresh every 8s when searches are running, 20s otherwise
  useEffect(() => {
    const interval = runs.some(r => r.status === 'SEARCHING' || r.status === 'PENDING') ? 8_000 : 20_000
    const t = setInterval(load, interval)
    return () => clearInterval(t)
  }, [load, runs])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" style={{ width: '24px', height: '24px' }} />
    </div>
  )

  const counts = {
    all: runs.length,
    running: runs.filter(r => r.status === 'SEARCHING' || r.status === 'PENDING').length,
    done: runs.filter(r => r.status === 'DONE' || r.status === 'EMAILED').length,
    error: runs.filter(r => r.status === 'ERROR').length,
  }

  const filtered = runs.filter(r => {
    if (filter === 'running') return r.status === 'SEARCHING' || r.status === 'PENDING'
    if (filter === 'done')    return r.status === 'DONE' || r.status === 'EMAILED'
    if (filter === 'error')   return r.status === 'ERROR'
    return true
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/icos-logo.svg" alt="Icos Capital" style={{ width: "88px", height: "auto" }} />
            <div className="w-px h-6" style={{ background: 'var(--border)' }} />
            <span className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--teal)' }}>
              &#127807; Herb
            </span>
            {counts.running > 0 && (
              <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--teal)', animation: 'pulse 1.5s infinite' }} />
                {counts.running} running
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--subtle)' }}>{user?.email}</span>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="text-xs" style={{ color: 'var(--muted)' }}>Sign out</button>
            <Link href="/dashboard/new"
              className="flex items-center gap-1 text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-all"
              style={{ background: 'var(--teal)', color: '#fff' }}>
              + New search
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Title + filters */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Search log</h1>
          <div className="flex items-center gap-0.5 p-1 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {(['all', 'running', 'done', 'error'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  background: filter === f ? 'var(--navy-light)' : 'transparent',
                  color: filter === f ? 'var(--navy)' : 'var(--subtle)',
                  border: filter === f ? '1px solid #c8d8f0' : '1px solid transparent',
                }}>
                {f === 'all' ? `All (${counts.all})` :
                 f === 'running' ? `Running (${counts.running})` :
                 f === 'done' ? `Done (${counts.done})` :
                 `Errors (${counts.error})`}
              </button>
            ))}
          </div>
        </div>

        {/* Empty */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl py-20 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-3xl mb-3">&#127793;</p>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
              {filter === 'all' ? 'No searches yet' : `No ${filter} searches`}
            </p>
            {filter === 'all' && (
              <Link href="/dashboard/new"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2 rounded-xl"
                style={{ background: 'var(--teal)', color: '#fff' }}>
                Start first search
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {/* Column headers */}
            <div className="grid px-5 py-2 text-xs font-medium uppercase tracking-wider"
              style={{ gridTemplateColumns: '12px 1fr 130px 80px 130px 36px', color: 'var(--subtle)', borderBottom: '1px solid var(--border)', gap: '16px' }}>
              <span />
              <span>Search</span>
              <span>Submitted by</span>
              <span>When</span>
              <span>Result</span>
              <span />
            </div>

            {filtered.map((run, i) => {
              const cfg = STATUS_CFG[run.status] ?? STATUS_CFG.PENDING
              const done = run.status === 'DONE' || run.status === 'EMAILED'
              const active = run.status === 'SEARCHING' || run.status === 'PENDING'
              const name = run.submitted_by_name ?? run.submitted_by_email?.split('@')[0] ?? '—'

              const row = (
                <div className="grid px-5 py-4 items-center transition-colors"
                  style={{
                    gridTemplateColumns: '12px 1fr 130px 80px 130px 36px',
                    gap: '16px',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: done ? 'pointer' : 'default',
                  }}>

                  {/* Status dot */}
                  <span className="flex justify-center">
                    <span className="w-2 h-2 rounded-full"
                      style={{
                        background: cfg.dotColor,
                        animation: cfg.pulse ? 'pulse 1.8s ease-in-out infinite' : 'none',
                        boxShadow: cfg.pulse ? `0 0 0 3px ${cfg.bgColor}` : 'none',
                      }} />
                  </span>

                  {/* Theme */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{run.theme}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                      {run.geography} &middot; {run.stage}
                    </p>
                  </div>

                  {/* Submitter */}
                  <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{name}</span>

                  {/* Time */}
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>{timeAgo(run.created_at)}</span>

                  {/* Result / Progress */}
                  <span className="text-xs font-medium flex items-center gap-1.5 min-w-0">
                    {active && (() => {
                      const stalled = run.last_heartbeat !== null && minutesSince(run.last_heartbeat) > 45
                      const pending = run.status === 'PENDING'
                      return stalled ? (
                        <span className="flex items-center gap-1.5" style={{ color: '#c0392b' }}>
                          <span>⚠ Stalled</span>
                        </span>
                      ) : pending ? (
                        <span className="flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
                          <div className="loading-spinner" style={{ width: '12px', height: '12px', borderTopColor: 'var(--subtle)' }} />
                          Queued
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 min-w-0" style={{ color: 'var(--teal)' }}>
                          <div className="loading-spinner" style={{ width: '12px', height: '12px', flexShrink: 0 }} />
                          <span className="truncate" title={run.progress ?? 'Searching…'}>
                            {run.progress ?? 'Searching…'}
                          </span>
                        </span>
                      )
                    })()}
                    {done && (
                      <span className="px-2 py-0.5 rounded-full text-xs"
                        style={{ background: 'var(--teal-light)', color: 'var(--teal)' }}>
                        {run.result_count ?? '—'} companies
                      </span>
                    )}
                    {run.status === 'ERROR' && (
                      <span className="px-2 py-0.5 rounded-full text-xs truncate"
                        title={run.error_message ?? ''}
                        style={{ background: '#fdf2f1', color: '#c0392b' }}>
                        {run.error_message ? run.error_message.slice(0, 40) : 'Failed'}
                      </span>
                    )}
                  </span>

                  {/* Download */}
                  <span className="flex justify-end">
                    {done && (
                      <button
                        onClick={async e => {
                          e.preventDefault(); e.stopPropagation()
                          setDownloading(run.id)
                          await downloadCSV(run.id, run.theme)
                          setDownloading(null)
                        }}
                        title="Download CSV"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all font-medium"
                        style={{ color: 'var(--teal)', background: downloading === run.id ? 'var(--teal-light)' : 'transparent' }}
                      >
                        {downloading === run.id
                          ? <div className="loading-spinner" style={{ width: '12px', height: '12px' }} />
                          : '&#8595;'}
                      </button>
                    )}
                  </span>
                </div>
              )

              return done
                ? <Link key={run.id} href={`/dashboard/mandates/${run.id}`} className="block"
                    style={{ display: 'block' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {row}
                  </Link>
                : <div key={run.id}>{row}</div>
            })}
          </div>
        )}

        <p className="text-center text-xs mt-5" style={{ color: 'var(--subtle)' }}>
          All Icos Capital searches &middot; auto-refreshes every 20s
        </p>
      </div>
    </div>
  )
}
