'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Company = {
  id: string; name: string; website: string | null
  description: string | null; geography: string | null
  stage: string | null; score: number | null
  linkedin: string | null; notes: string | null
  source: string | null
}
type Run = {
  id: string; theme: string; status: string
  geography: string; stage: string; search_mode: string
  special_instructions: string | null; created_at: string
  submitted_by_name: string | null; submitted_by_email: string | null
  result_count: number | null
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

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  // Feedback state
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: r } = await supabase.from('herb_runs').select('*').eq('id', params.id).single()
      if (!r) { router.push('/dashboard'); return }
      setRun(r)
      const { data: c } = await supabase.from('herb_longlist').select('*')
        .eq('run_id', params.id).order('score', { ascending: false })
      setCompanies(c ?? [])
      setLoading(false)
    }
    load()
  }, [params.id, router])

  const toggleExclude = (name: string) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const submitFeedback = async () => {
    if (!feedbackText.trim() && excluded.size === 0) return
    setSubmitting(true)
    setFeedbackError(null)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          run_id: params.id,
          feedback_text: feedbackText,
          excluded_companies: Array.from(excluded),
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Unknown error')
      setFeedbackDone(true)
      // Go back to dashboard after short pause so user sees the new PENDING run + Run button
      setTimeout(() => router.push('/dashboard'), 1800)
    } catch (e: any) {
      setFeedbackError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const download = async () => {
    if (!run || companies.length === 0) return
    setDownloading(true)
    const cols = ['name', 'description', 'website', 'linkedin', 'stage', 'geography', 'score', 'source', 'notes'] as const
    const headers = ['Company', 'Description', 'Website', 'LinkedIn', 'Stage', 'Geography', 'Score', 'Source', 'Notes']
    const rows = companies.map(c => cols.map(k => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','))
    const csv = '﻿' + [headers.join(','), ...rows].join('\n')
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
      download: `herb-${run.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`,
    })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setDownloading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" />
    </div>
  )
  if (!run) return null

  const submitter = run.submitted_by_name ?? run.submitted_by_email?.split('@')[0] ?? 'Unknown'

  // Group by source for dealflow intelligence
  const sourceMap = companies.reduce((acc, c) => {
    const src = c.source ?? 'Other'
    acc[src] = (acc[src] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const sources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-3.5 sticky top-0 z-10 flex items-center justify-between"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-sm flex-shrink-0" style={{ color: 'var(--muted)' }}>&#8592; Log</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{run.theme}</span>
        </div>
        {companies.length > 0 && (
          <button onClick={download} disabled={downloading}
            className="flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-lg flex-shrink-0 transition-all"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
            {downloading
              ? <><span className="loading-spinner" style={{ width: '13px', height: '13px' }} /> Downloading…</>
              : <>&#8595; Download CSV ({companies.length})</>}
          </button>
        )}
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Run meta */}
        <div className="rounded-xl px-5 py-4 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <span><strong style={{ color: 'var(--text)' }}>Submitted by</strong> {submitter}</span>
            <span><strong style={{ color: 'var(--text)' }}>When</strong> {timeAgo(run.created_at)}</span>
            <span><strong style={{ color: 'var(--text)' }}>Geography</strong> {run.geography}</span>
            <span><strong style={{ color: 'var(--text)' }}>Stage</strong> {run.stage}</span>
            <span><strong style={{ color: 'var(--text)' }}>Mode</strong> {run.search_mode}</span>
          </div>
          {run.special_instructions && (
            <p className="mt-3 pt-3 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>Brief: </strong>{run.special_instructions}
            </p>
          )}
        </div>

        {/* Dealflow sources */}
        {sources.length > 0 && (
          <div className="rounded-xl px-5 py-4 mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--subtle)' }}>
              Dealflow sources
            </p>
            <div className="flex flex-wrap gap-2">
              {sources.map(([src, count]) => (
                <span key={src} className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{src}</span>
                  <span style={{ color: 'var(--subtle)' }}>{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Companies */}
        {companies.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Results not yet available.</p>
          </div>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--subtle)' }}>
              {companies.length} companies
            </p>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {companies.map((co, i) => {
                const isExcluded = excluded.has(co.name)
                return (
                  <div key={co.id} className="px-5 py-4"
                    style={{
                      borderBottom: i < companies.length - 1 ? '1px solid var(--border)' : 'none',
                      opacity: isExcluded ? 0.4 : 1,
                      transition: 'opacity 0.15s',
                    }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xs pt-0.5 w-5 text-right flex-shrink-0" style={{ color: 'var(--subtle)' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{co.name}</span>
                          {co.score !== null && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>{co.score}/10</span>
                          )}
                          {co.stage && (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>{co.stage}</span>
                          )}
                        </div>
                        {co.description && <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>{co.description}</p>}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--subtle)' }}>
                          {co.geography && <span>&#128205; {co.geography}</span>}
                          {co.source && <span>via {co.source}</span>}
                          {co.website && <a href={co.website} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>Website</a>}
                          {co.linkedin && <a href={co.linkedin} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>LinkedIn</a>}
                        </div>
                        {co.notes && <p className="text-xs mt-1.5 italic" style={{ color: 'var(--subtle)' }}>{co.notes}</p>}
                      </div>
                      {/* Exclude toggle */}
                      <button
                        onClick={() => toggleExclude(co.name)}
                        title={isExcluded ? 'Include in round 2' : 'Exclude from round 2'}
                        className="flex-shrink-0 text-xs px-2 py-1 rounded-lg transition-all"
                        style={{
                          background: isExcluded ? '#fdf2f1' : 'var(--bg)',
                          color: isExcluded ? '#c0392b' : 'var(--subtle)',
                          border: `1px solid ${isExcluded ? '#e74c3c' : 'var(--border)'}`,
                        }}>
                        {isExcluded ? '✕ Excluded' : 'Exclude'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Feedback panel */}
        {companies.length > 0 && (
          <div className="mt-8 rounded-2xl px-6 py-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Start round 2
            </p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Exclude companies above by clicking "Exclude", then describe adjustments below.
              Herb will run a fresh search incorporating your feedback.
            </p>

            {excluded.size > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Array.from(excluded).map(name => (
                  <span key={name} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                    style={{ background: '#fdf2f1', color: '#c0392b', border: '1px solid #e74c3c' }}>
                    ✕ {name}
                    <button onClick={() => toggleExclude(name)} style={{ opacity: 0.6, marginLeft: '2px' }}>×</button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="e.g. Focus more on Series A companies. Add supply chain / logistics angle. Find more German and Dutch companies. Less pharma, more industrial."
              rows={3}
              className="w-full text-sm rounded-xl px-4 py-3 resize-none outline-none transition-all"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: 'inherit',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--teal)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />

            {feedbackError && (
              <p className="text-xs mt-2" style={{ color: '#c0392b' }}>⚠ {feedbackError}</p>
            )}

            {feedbackDone ? (
              <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--teal)' }}>
                <span>✓</span>
                <span>Round 2 queued — returning to dashboard…</span>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {excluded.size > 0 ? `${excluded.size} excluded · ` : ''}
                  {feedbackText.trim() ? `"${feedbackText.trim().slice(0, 60)}${feedbackText.length > 60 ? '…' : ''}"` : 'No instructions yet'}
                </span>
                <button
                  onClick={submitFeedback}
                  disabled={submitting || (!feedbackText.trim() && excluded.size === 0)}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
                  style={{
                    background: (feedbackText.trim() || excluded.size > 0) ? 'var(--teal)' : 'var(--border)',
                    color: (feedbackText.trim() || excluded.size > 0) ? '#fff' : 'var(--subtle)',
                    cursor: (feedbackText.trim() || excluded.size > 0) ? 'pointer' : 'not-allowed',
                  }}>
                  {submitting
                    ? <><div className="loading-spinner" style={{ width: '13px', height: '13px', borderTopColor: '#fff' }} /> Creating…</>
                    : '↻ Start round 2'}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}