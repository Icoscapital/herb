'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Run = {
  id: string; theme: string; status: string
  geography: string; stage: string
  created_at: string; keywords: string | null
}

const STATUS: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  SEARCHING: { label: 'Searching',    color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  DONE:      { label: 'Complete',     color: '#166534', bg: '#f0fdf4', dot: '#22c55e' },
  EMAILED:   { label: 'Results sent', color: '#6b21a8', bg: '#faf5ff', dot: '#a855f7' },
  ERROR:     { label: 'Error',        color: '#991b1b', bg: '#fef2f2', dot: '#ef4444' },
  PENDING:   { label: 'Queued',       color: '#92400e', bg: '#fffbeb', dot: '#f59e0b' },
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadRuns = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('herb_runs')
      .select('id,theme,status,geography,stage,created_at,keywords')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setRuns(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      loadRuns(session.user.id).then(() => setLoading(false))
    })
  }, [router, loadRuns])

  useEffect(() => {
    if (!user) return
    const t = setInterval(() => loadRuns(user.id), 30_000)
    return () => clearInterval(t)
  }, [user, loadRuns])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" />
    </div>
  )

  const name = user?.user_metadata?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'
  const inProgress = runs.filter(r => r.status === 'SEARCHING' || r.status === 'PENDING').length

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Sidebar + main layout */}
      <div className="flex">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 min-h-screen px-4 py-6 sticky top-0"
          style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-8 px-2">
            <span className="text-base">&#127807;</span>
            <span className="font-semibold text-sm tracking-tight">Herb</span>
          </div>
          <nav className="space-y-0.5">
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              <span>&#128269;</span> Searches
            </div>
          </nav>
          <div className="mt-auto px-2">
            <div className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>{user?.email}</div>
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="text-xs w-full text-left py-1.5"
              style={{ color: 'var(--muted)' }}
            >Sign out</button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 px-6 md:px-10 py-8 max-w-3xl">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-xl font-semibold mb-0.5" style={{ color: 'var(--text)' }}>
                Good to see you, {name}
              </h1>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {inProgress > 0
                  ? `${inProgress} search${inProgress > 1 ? 'es' : ''} running in the cloud right now`
                  : 'Submit a mandate and Herb will find matching startups'}
              </p>
            </div>
            <Link
              href="/dashboard/new"
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-all"
              style={{ background: 'var(--text)', color: '#fff' }}
            >
              <span className="text-base leading-none">+</span>
              New search
            </Link>
          </div>

          {/* Empty state */}
          {runs.length === 0 ? (
            <div className="rounded-2xl py-20 text-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-3xl mb-3">&#127793;</div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>No searches yet</p>
              <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
                Describe what you are looking for and Herb will handle the rest
              </p>
              <Link href="/dashboard/new"
                className="inline-flex items-center gap-1.5 text-sm font-medium px-5 py-2.5 rounded-xl"
                style={{ background: 'var(--text)', color: '#fff' }}>
                Start first search
              </Link>
            </div>
          ) : (
            <>
              {/* Section label */}
              <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--subtle)' }}>
                Recent searches
              </p>
              <div className="space-y-1.5">
                {runs.map(run => {
                  const s = STATUS[run.status] ?? STATUS.PENDING
                  const done = ['DONE', 'EMAILED'].includes(run.status)
                  const date = new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  const row = (
                    <div
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all"
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        cursor: done ? 'pointer' : 'default',
                      }}
                    >
                      {/* Status dot */}
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          background: s.dot,
                          boxShadow: run.status === 'SEARCHING' ? `0 0 0 3px ${s.bg}` : 'none',
                          animation: run.status === 'SEARCHING' ? 'pulse 2s infinite' : 'none',
                        }}
                      />
                      {/* Theme */}
                      <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {run.theme}
                      </span>
                      {/* Meta */}
                      <span className="text-xs hidden sm:block" style={{ color: 'var(--subtle)' }}>
                        {run.geography}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>{date}</span>
                      {/* Status pill */}
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {s.label}
                      </span>
                      {done && <span className="text-xs" style={{ color: 'var(--subtle)' }}>&#8594;</span>}
                    </div>
                  )
                  return done
                    ? <Link key={run.id} href={`/dashboard/mandates/${run.id}`}>{row}</Link>
                    : <div key={run.id}>{row}</div>
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
