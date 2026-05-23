'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Run = {
  id: string
  theme: string
  status: string
  geography: string
  stage: string
  search_mode: string
  created_at: string
  submitted_by_email: string | null
  submitted_by_name: string | null
  result_count: number | null
  duration_seconds: number | null
  error_message: string | null
}

type Filter = 'all' | 'running' | 'done' | 'error'

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const DOT: Record<string, { color: string; pulse: boolean }> = {
  PENDING:   { color: '#f59e0b', pulse: true },
  SEARCHING: { color: '#3b82f6', pulse: true },
  DONE:      { color: '#22c55e', pulse: false },
  EMAILED:   { color: '#22c55e', pulse: false },
  ERROR:     { color: '#ef4444', pulse: false },
}

async function downloadCSV(runId: string, theme: string) {
  const { data } = await supabase
    .from('herb_longlist')
    .select('*')
    .eq('run_id', runId)
    .order('score', { ascending: false })
  if (!data || data.length === 0) { alert('No results to download yet.'); return }
  const cols = ['name', 'description', 'website', 'linkedin', 'stage', 'geography', 'score', 'source', 'notes']
  const headers = ['Company', 'Description', 'Website', 'LinkedIn', 'Stage', 'Geography', 'Score', 'Source', 'Notes']
  const rows = data.map(c => cols.map(k => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','))
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
      .select('id,theme,status,geography,stage,search_mode,created_at,submitted_by_email,submitted_by_name,result_count,duration_seconds,error_message')
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

  useEffect(() => {
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [load])

  const filtered = runs.filter(r => {
    if (filter === 'running') return r.status === 'SEARCHING' || r.status === 'PENDING'
    if (filter === 'done') return r.status === 'DONE' || r.status === 'EMAILED'
    if (filter === 'error') return r.status === 'ERROR'
    return true
  })

  const running = runs.filter(r => r.status === 'SEARCHING' || r.status === 'PENDING').length

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Top nav */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-sm tracking-tight flex items-center gap-2">
              <span>&#127807;</span> Herb
            </span>
            {running > 0 && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#3b82f6' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" style={{ animation: 'pulse 1.5s infinite' }} />
                {running} running
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--subtle)' }}>{user?.email}</span>
            <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="text-xs" style={{ color: 'var(--muted)' }}>Sign out</button>
            <Link href="/dashboard/new"
              className="flex items-center gap-1 text-xs font-medium px-3.5 py-1.5 rounded-lg"
              style={{ background: 'var(--text)', color: '#fff' }}>
              + New search
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Page title + filters */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Search log</h1>
          <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {(['all', 'running', 'done', 'error'] as Filter[]).map(f => (
              <button key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                style={{
                  background: filter === f ? 'var(--bg)' : 'transparent',
                  color: filter === f ? 'var(--text)' : 'var(--subtle)',
                  border: filter === f ? '1px solid var(--border)' : '1px solid transparent',
                }}>
                {f === 'all' ? `All (${runs.length})` : f === 'running' ? `Running (${runs.filter(r => r.status === 'SEARCHING' || r.status === 'PENDING').length})` : f === 'done' ? `Done (${runs.filter(r => r.status === 'DONE' || r.status === 'EMAILED').length})` : `Errors (${runs.filter(r => r.status === 'ERROR').length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Log table */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl py-20 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-3xl mb-3">&#127793;</p>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
              {filter === 'all' ? 'No searches yet' : `No ${filter} searches`}
            </p>
            {filter === 'all' && (
              <Link href="/dashboard/new"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2 rounded-xl"
                style={{ background: 'var(--text)', color: '#fff' }}>
                Start first search
              </Link>
            )}
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {/* Column headers */}
            <div className="grid gap-4 px-5 py-2.5 text-xs font-medium uppercase tracking-wider border-b"
              style={{ gridTemplateColumns: '16px 1fr 120px 80px 100px 40px', color: 'var(--subtle)', borderColor: 'var(--border)' }}>
              <span />
              <span>Search</span>
              <span>Submitted by</span>
              <span>When</span>
              <span>Result</span>
              <span />
            </div>

            {/* Rows */}
            {filtered.map((run, i) => {
              const dot = DOT[run.status] ?? DOT.PENDING
              const done = run.status === 'DONE' || run.status === 'EMAILED'
              const active = run.status === 'SEARCHING' || run.status === 'PENDING'
              const name = run.submitted_by_name ?? run.submitted_by_email?.split('@')[0] ?? '—'
              const rowStyle = {
                borderBottom: i < filtered.length - 1 ? `1px solid var(--border)` : 'none',
              }
              const row = (
                <div className="grid gap-4 px-5 py-4 items-center transition-colors"
                  style={{
                    gridTemplateColumns: '16px 1fr 120px 80px 100px 40px',
                    ...rowStyle,
                    cursor: done ? 'pointer' : 'default',
                  }}>

                  {/* Status dot */}
                  <span className="flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: dot.color,
                        boxShadow: dot.pulse ? `0 0 0 3px ${dot.color}22` : 'none',
                        animation: dot.pulse ? 'pulse 1.8s ease-in-out infinite' : 'none',
                      }} />
                  </span>

                  {/* Theme + meta */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{run.theme}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                      {run.geography} &middot; {run.stage}
                      {run.search_mode === 'DEEP' && <span> &middot; Deep</span>}
                    </p>
                  </div>

                  {/* Submitter */}
                  <span className="text-xs truncate" style={{ color: 'var(--muted)' }}>{name}</span>

                  {/* Time */}
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>{timeAgo(run.created_at)}</span>

                  {/* Result */}
                  <span className="text-xs font-medium"
                    style={{ color: done ? 'var(--accent)' : active ? '#3b82f6' : '#ef4444' }}>
                    {active && <span className="flex items-center gap-1.5"><span className="loading-spinner" style={{ width: '12px', height: '12px' }} /> Searching</span>}
                    {done && `${run.result_count ?? '—'} companies`}
                    {run.status === 'ERROR' && 'Failed'}
                  </span>

                  {/* Download */}
                  <span className="flex items-center justify-end">
                    {done && (
                      <button
                        onClick={async e => {
                          e.preventDefault(); e.stopPropagation()
                          setDownloading(run.id)
                          await downloadCSV(run.id, run.theme)
                          setDownloading(null)
                        }}
                        title="Download CSV"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-sm"
                        style={{ background: downloading === run.id ? 'var(--accent-light)' : 'transparent', color: 'var(--accent)' }}
                      >
                        {downloading === run.id ? <span className="loading-spinner" style={{ width: '12px', height: '12px' }} /> : '&#8595;'}
                      </button>
                    )}
                  </span>
                </div>
              )

              return done
                ? <Link key={run.id} href={`/dashboard/mandates/${run.id}`} className="block hover:bg-slate-50 transition-colors">{row}</Link>
                : <div key={run.id}>{row}</div>
            })}
          </div>
        )}

        <p className="text-xs text-center mt-6" style={{ color: 'var(--subtle)' }}>
          Showing all searches across Icos Capital &middot; Auto-refreshes every 20s
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
