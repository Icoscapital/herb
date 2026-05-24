'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type FileSlot = { type: 'pitchbook' | 'company-list' | 'check-sites'; name: string; url: string; path: string; size: number }
const FILE_SLOTS: { key: FileSlot['type']; label: string; hint: string; icon: string }[] = [
  { key: 'pitchbook',    label: 'PitchBook export', hint: '.xlsx export from PitchBook',        icon: '📊' },
  { key: 'company-list', label: 'Company list',     hint: 'Your own list of companies (.xlsx/.csv)', icon: '📋' },
  { key: 'check-sites',  label: 'Check sites',      hint: 'Sites/portfolios to search (.xlsx/.csv)', icon: '🌐' },
]

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

const PAGE_SIZE = 10

// Country name → ISO-2 code
const COUNTRY_CODE: Record<string, string> = {
  'united kingdom': 'GB', 'uk': 'GB', 'germany': 'DE', 'switzerland': 'CH',
  'france': 'FR', 'netherlands': 'NL', 'sweden': 'SE', 'denmark': 'DK',
  'finland': 'FI', 'norway': 'NO', 'belgium': 'BE', 'austria': 'AT',
  'italy': 'IT', 'spain': 'ES', 'poland': 'PL', 'ireland': 'IE',
  'portugal': 'PT', 'czech republic': 'CZ', 'hungary': 'HU', 'romania': 'RO',
  'europe': 'EU', 'estonia': 'EE', 'latvia': 'LV', 'lithuania': 'LT',
}
function countryCode(geo: string | null): string {
  if (!geo) return '—'
  const key = geo.toLowerCase().trim()
  return COUNTRY_CODE[key] ?? geo.slice(0, 2).toUpperCase()
}

// Derive up to 4 tag chips from description + notes
type Tag = { label: string; style: 'tech' | 'sector' | 'status' }
function deriveTags(co: Company): Tag[] {
  const haystack = `${co.description ?? ''} ${co.notes ?? ''} ${co.source ?? ''}`.toLowerCase()
  const tags: Tag[] = []

  // Tech tags (blue)
  if (haystack.includes('causal ai') || haystack.includes('causal inference') || haystack.includes('causal machine'))
    tags.push({ label: 'Causal AI', style: 'tech' })
  if (haystack.includes('process opt') || haystack.includes('process optimization') || haystack.includes('process booster') || haystack.includes('setpoint'))
    tags.push({ label: 'Process opt.', style: 'tech' })
  if (haystack.includes('generative ai') || haystack.includes('generative mol') || haystack.includes('llm'))
    tags.push({ label: 'Generative AI', style: 'tech' })
  if (haystack.includes('computer vision') || haystack.includes('vision ai') || haystack.includes('histopath'))
    tags.push({ label: 'Computer vision', style: 'tech' })
  if (haystack.includes('knowledge graph') || haystack.includes('causal graph'))
    tags.push({ label: 'Knowledge graph', style: 'tech' })
  if (haystack.includes('decision') && (haystack.includes('intel') || haystack.includes('simulation')))
    tags.push({ label: 'Decision intel.', style: 'tech' })

  // Sector tags (green)
  if (haystack.includes('food') || haystack.includes('dairy') || haystack.includes('nutrition') || haystack.includes('beverage') || haystack.includes('fmcg'))
    tags.push({ label: 'Food', style: 'sector' })
  if (haystack.includes('chem') || haystack.includes('specialty chem') || haystack.includes('catalysis') || haystack.includes('molecule'))
    tags.push({ label: 'Chem.', style: 'sector' })
  if (haystack.includes('pharma') || haystack.includes('drug') || haystack.includes('biomedical') || haystack.includes('biotech'))
    tags.push({ label: 'Pharma', style: 'sector' })
  if (haystack.includes('material') || haystack.includes('advanced material'))
    tags.push({ label: 'Materials', style: 'sector' })
  if (haystack.includes('carbon') || haystack.includes('co2') || haystack.includes('ccus') || haystack.includes('emission') || haystack.includes('decarboni'))
    tags.push({ label: 'CCUS', style: 'sector' })
  if (haystack.includes('supply chain') || haystack.includes('procurement') || haystack.includes('logistics'))
    tags.push({ label: 'Supply chain', style: 'sector' })
  if (haystack.includes('manufacturing') || haystack.includes('industrial') || haystack.includes('factory'))
    tags.push({ label: 'Industrial AI', style: 'sector' })

  // Pipedrive status tag
  if (haystack.includes('pipedrive: lost'))
    tags.push({ label: 'Prev. evaluated', style: 'status' })

  // Return max 4, prioritising tech first then sector
  return tags.slice(0, 4)
}

// Deterministic avatar color from company name
const AVATAR_COLORS = [
  { bg: '#1a2b4a', fg: '#fff' },  // navy
  { bg: '#0e7c6e', fg: '#fff' },  // teal
  { bg: '#7c4daa', fg: '#fff' },  // purple
  { bg: '#c0392b', fg: '#fff' },  // red
  { bg: '#b7600a', fg: '#fff' },  // amber
  { bg: '#2471a3', fg: '#fff' },  // blue
  { bg: '#1e8449', fg: '#fff' },  // green
  { bg: '#6c3483', fg: '#fff' },  // violet
]
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Thesis fit bar color
function fitColor(score: number | null): string {
  if (score === null) return 'var(--subtle)'
  if (score >= 8) return '#1e8449'
  if (score >= 6) return '#b7600a'
  return '#999'
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
  const [page, setPage] = useState(1)
  // Feedback state
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [feedbackText, setFeedbackText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedbackDone, setFeedbackDone] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  // File upload for round 2
  const [uploadedFiles, setUploadedFiles] = useState<FileSlot[]>([])
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
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

  const uploadFiles = useCallback(async (slotKey: string, fileList: FileList) => {
    if (!fileList.length) return
    setUploadingSlot(slotKey)
    setUploadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const slotType = slotKey as FileSlot['type']
      const files = Array.from(fileList)
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `mandates/${session.user.id}/${Date.now()}-${i}-${slotKey}-${safe}`
        const { error: e } = await supabase.storage.from('herb-uploads').upload(path, file)
        if (e) {
          setUploadError(`Could not upload ${file.name}: ${e.message}`)
        } else {
          const { data: { publicUrl } } = supabase.storage.from('herb-uploads').getPublicUrl(path)
          setUploadedFiles(prev => [...prev, { type: slotType, name: file.name, url: publicUrl, path, size: file.size }])
        }
      }
    } finally {
      setUploadingSlot(null)
    }
  }, [])

  const removeFile = async (slot: FileSlot) => {
    setUploadedFiles(prev => prev.filter(f => f.path !== slot.path))
    await supabase.storage.from('herb-uploads').remove([slot.path])
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
          attachments: uploadedFiles.length ? uploadedFiles.map(f => ({ type: f.type, name: f.name, url: f.url })) : null,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Unknown error')
      setFeedbackDone(true)
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
  const totalPages = Math.ceil(companies.length / PAGE_SIZE)
  const pageCompanies = companies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header className="px-6 py-3.5 sticky top-0 z-10 flex items-center justify-between"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-sm flex-shrink-0" style={{ color: 'var(--muted)' }}>← Log</Link>
          <span style={{ color: 'var(--border)' }}>|</span>
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{run.theme}</span>
        </div>
        {companies.length > 0 && (
          <button onClick={download} disabled={downloading}
            className="flex items-center gap-2 text-sm font-medium px-4 py-1.5 rounded-lg flex-shrink-0 transition-all"
            style={{ background: 'var(--teal-light)', color: 'var(--teal)', border: '1px solid var(--teal)' }}>
            {downloading
              ? <><span className="loading-spinner" style={{ width: '13px', height: '13px' }} /> Downloading…</>
              : <>↓ CSV ({companies.length})</>}
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Run meta bar */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs mb-6 px-1"
          style={{ color: 'var(--muted)' }}>
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{companies.length} companies</span>
          <span>by {submitter}</span>
          <span>{timeAgo(run.created_at)}</span>
          <span className="px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
            {run.geography}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
            {run.stage}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
            {run.search_mode}
          </span>
        </div>

        {/* Table */}
        {companies.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Results not yet available.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {/* Column headers */}
            <div className="grid px-4 py-2.5 text-xs font-medium uppercase tracking-wider"
              style={{
                gridTemplateColumns: '2fr 1.4fr 52px 90px 90px 80px 72px',
                gap: '12px',
                color: 'var(--subtle)',
                borderBottom: '1px solid var(--border)',
              }}>
              <span>Company</span>
              <span>Tags</span>
              <span>Country</span>
              <span>Stage</span>
              <span>Pipedrive</span>
              <span>Thesis fit</span>
              <span>Round 2</span>
            </div>

            {/* Rows */}
            {pageCompanies.map((co, i) => {
              const isExcluded = excluded.has(co.name)
              const tags = deriveTags(co)
              const av = avatarColor(co.name)
              const fit = co.score !== null ? Math.round(co.score * 10) : null
              const pipedrive = co.notes?.match(/Pipedrive:\s*([^|]+)/)?.[1]?.trim() ?? 'New'
              const isLost = pipedrive.toLowerCase().includes('lost')

              return (
                <div key={co.id}
                  className="grid px-4 items-center transition-colors"
                  style={{
                    gridTemplateColumns: '2fr 1.4fr 52px 90px 90px 80px 72px',
                    gap: '12px',
                    borderBottom: i < pageCompanies.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: isExcluded ? 0.35 : 1,
                    transition: 'opacity 0.15s, background 0.1s',
                    minHeight: '56px',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => !isExcluded && (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Company */}
                  <div className="flex items-center gap-2.5 min-w-0 py-2">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: av.bg, color: av.fg, letterSpacing: '0.02em' }}>
                      {initials(co.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {co.name}
                        </span>
                        {co.website && (
                          <a href={co.website} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 text-xs"
                            style={{ color: 'var(--subtle)' }}
                            title={co.website}>↗</a>
                        )}
                      </div>
                      {co.description && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}
                          title={co.description}>
                          {co.description.slice(0, 70)}{co.description.length > 70 ? '…' : ''}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 py-2">
                    {tags.map(tag => (
                      <span key={tag.label} className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{
                          background: tag.style === 'tech' ? '#e8f0fc' : tag.style === 'sector' ? '#e8f5ee' : '#fdf2f1',
                          color: tag.style === 'tech' ? '#2471a3' : tag.style === 'sector' ? '#1e8449' : '#c0392b',
                        }}>
                        {tag.label}
                      </span>
                    ))}
                  </div>

                  {/* Country */}
                  <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {countryCode(co.geography)}
                  </div>

                  {/* Stage */}
                  <div>
                    {co.stage && (
                      <span className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {co.stage}
                      </span>
                    )}
                  </div>

                  {/* Pipedrive */}
                  <div className="text-xs truncate"
                    style={{ color: isLost ? '#c0392b' : 'var(--subtle)' }}>
                    {isLost ? `Lost` : 'New'}
                  </div>

                  {/* Thesis fit */}
                  <div className="flex items-center gap-1.5">
                    {fit !== null ? (
                      <>
                        <div className="w-5 h-1 rounded-full flex-shrink-0"
                          style={{ background: fitColor(co.score) }} />
                        <span className="text-sm font-semibold"
                          style={{ color: fitColor(co.score) }}>
                          {fit}%
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--subtle)' }}>—</span>
                    )}
                  </div>

                  {/* Exclude toggle — always visible */}
                  <div>
                    <button
                      onClick={() => toggleExclude(co.name)}
                      title={isExcluded ? 'Re-include in round 2' : 'Exclude from round 2'}
                      className="text-xs px-2.5 py-1 rounded-lg transition-all"
                      style={{
                        background: isExcluded ? '#fdf2f1' : 'var(--bg)',
                        color: isExcluded ? '#c0392b' : 'var(--subtle)',
                        border: `1px solid ${isExcluded ? '#e74c3c' : 'var(--border)'}`,
                        fontWeight: isExcluded ? 600 : 400,
                      }}>
                      {isExcluded ? '✕ Out' : 'Exclude'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
              const isEllipsis = totalPages > 6 && p !== 1 && p !== totalPages && Math.abs(p - page) > 2
              if (isEllipsis && (p === 2 || p === totalPages - 1)) {
                return <span key={p} className="px-2 text-sm" style={{ color: 'var(--subtle)' }}>…</span>
              }
              if (isEllipsis) return null
              return (
                <button key={p} onClick={() => setPage(p)}
                  className="w-8 h-8 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: p === page ? 'var(--navy)' : 'var(--surface)',
                    color: p === page ? '#fff' : 'var(--muted)',
                    border: `1px solid ${p === page ? 'var(--navy)' : 'var(--border)'}`,
                  }}>
                  {p}
                </button>
              )
            })}
            {page < totalPages && (
              <button onClick={() => setPage(p => p + 1)}
                className="w-8 h-8 rounded-lg text-sm transition-all"
                style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                ›
              </button>
            )}
          </div>
        )}

        {/* Feedback panel */}
        {companies.length > 0 && (
          <div className="mt-8 rounded-2xl px-6 py-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Start round 2</p>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Click any company row's × to exclude it, then describe adjustments below.
              Herb runs a fresh search incorporating your feedback.
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
              placeholder="e.g. Focus on Series A only. More German and Dutch companies. Less pharma, more industrial process optimization."
              rows={3}
              className="w-full text-sm rounded-xl px-4 py-3 resize-none outline-none"
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'inherit',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--teal)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />

            {/* Labeled file upload slots */}
            <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {FILE_SLOTS.map(slot => {
                const inputId = `r2-file-${slot.key}`
                const slotFiles = uploadedFiles.filter(f => f.type === slot.key)
                const isUploading = uploadingSlot === slot.key
                return (
                  <div key={slot.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input
                      id={inputId}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files
                        if (f && f.length > 0) uploadFiles(slot.key, f)
                        e.target.value = ''
                      }}
                    />
                    {slotFiles.map(sf => (
                      <div key={sf.path} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        fontSize: '12px', padding: '5px 10px', borderRadius: '10px',
                        background: 'var(--teal-light)', border: '1px solid var(--teal)', color: 'var(--teal)',
                      }}>
                        <span style={{ flexShrink: 0, fontSize: '11px' }}>✓</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}
                          title={sf.name}>{sf.name}</span>
                        <button onClick={() => removeFile(sf)}
                          style={{ color: 'var(--teal)', opacity: 0.6, flexShrink: 0, lineHeight: 1, fontSize: '14px' }}>×</button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        const el = document.getElementById(inputId) as HTMLInputElement | null
                        el?.click()
                      }}
                      style={{
                        width: '100%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', gap: '3px',
                        padding: slotFiles.length > 0 ? '6px 8px' : '10px 8px',
                        borderRadius: '12px', fontSize: '12px',
                        cursor: isUploading ? 'default' : 'pointer',
                        background: isUploading ? 'var(--teal-light)' : 'var(--bg)',
                        border: (isUploading || slotFiles.length > 0)
                          ? '1.5px solid var(--teal)'
                          : '1px dashed var(--border)',
                        color: 'var(--subtle)',
                        animation: isUploading ? 'pulse 1s ease-in-out infinite' : 'none',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isUploading) e.currentTarget.style.borderColor = 'var(--teal)' }}
                      onMouseLeave={e => { if (!isUploading && slotFiles.length === 0) e.currentTarget.style.borderColor = 'var(--border)' }}
                    >
                      {isUploading ? (
                        <>
                          <span className="loading-spinner" style={{ width: '13px', height: '13px', margin: '1px 0' }} />
                          <span style={{ fontWeight: 500, color: 'var(--teal)' }}>Uploading…</span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: '16px' }}>{slot.icon}</span>
                          <span style={{ fontWeight: 500, color: slotFiles.length > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                            {slotFiles.length > 0 ? `+ add more (${slotFiles.length})` : slot.label}
                          </span>
                          {slotFiles.length === 0 && (
                            <span style={{ fontSize: '10px', color: 'var(--subtle)', textAlign: 'center' }}>{slot.hint}</span>
                          )}
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            {uploadError && (
              <p className="text-xs mt-2" style={{ color: '#c0392b' }}>⚠ {uploadError}</p>
            )}

            {feedbackError && (
              <p className="text-xs mt-2" style={{ color: '#c0392b' }}>⚠ {feedbackError}</p>
            )}

            {feedbackDone ? (
              <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--teal)' }}>
                ✓ Round 2 queued — returning to dashboard…
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {excluded.size > 0 ? `${excluded.size} excluded · ` : ''}
                  {feedbackText.trim()
                    ? `"${feedbackText.trim().slice(0, 60)}${feedbackText.length > 60 ? '…' : ''}"`
                    : 'No instructions yet'}
                </span>
                <button onClick={submitFeedback}
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
