'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/api-client'
import { generateRunSlug } from '@/lib/slug'
import SearchPlanDialog, { SearchPlan } from '@/components/SearchPlanDialog'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Attachment = { name: string; size: number; url: string; path: string; fileType?: string }

const FILE_SLOTS = [
  { key: 'pitchbook',    label: 'PitchBook export', hint: '.xlsx from PitchBook',                icon: '📊', chipBg: '#e8f0fc', chipBorder: '#2471a3', chipColor: '#2471a3' },
  { key: 'company-list', label: 'Company list',     hint: 'Your own list (.xlsx / .csv)',         icon: '📋', chipBg: '#e8edf5', chipBorder: '#1a2b4a', chipColor: '#1a2b4a' },
  { key: 'check-sites',  label: 'Check sites',      hint: 'Portfolios / sites to scrape (.csv)',  icon: '🌐', chipBg: '#e8f5ee', chipBorder: '#1e8449', chipColor: '#1e8449' },
] as const

const EXAMPLES = [
  'Sustainable packaging startups in Europe, Series A, bio-based or recycled materials',
  'B2B SaaS for supply chain visibility, pre-Series A, Netherlands or Germany',
  'Alt-protein using fermentation, not yet in our pipeline, global',
]

const STAGE_OPTIONS = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+'] as const

export default function NewMandatePage() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'COMPREHENSIVE' | 'EU_ONLY'>('COMPREHENSIVE')
  const [stages, setStages] = useState<string[]>(['Series A', 'Series B'])
  const [icosFit, setIcosFit] = useState(false)          // scoring is opt-in
  const [includeSmall, setIncludeSmall] = useState(false) // <10 FTE excluded by default
  const [seedText, setSeedText] = useState('')
  const [exhaustive, setExhaustive] = useState(false)
  // Confirm-before-run dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [plan, setPlan] = useState<SearchPlan | null>(null)
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 400) + 'px'
  }

  const upload = useCallback(async (list: FileList | null, slotType?: string) => {
    if (!list || list.length === 0) return
    const arr = Array.from(list)  // Capture before any await — FileList is cleared when input.value resets
    if (slotType) { setUploadingSlot(slotType); setSlotError(null) } else setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const added: Attachment[] = []
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i]
        const fd = new FormData()
        fd.append('file', f)
        if (slotType) fd.append('slotType', slotType)
        fd.append('index', String(i))
        let json: any
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: fd,
          })
          json = await res.json()
        } catch (fetchErr: any) {
          if (slotType) setSlotError(`Upload failed: ${fetchErr?.message ?? 'network error'}`)
          else setError(`Upload failed: ${fetchErr?.message ?? 'network error'}`)
          continue
        }
        if (!json.ok) {
          if (slotType) setSlotError(`${f.name}: ${json.error}`)
          else setError(`Could not upload ${f.name}: ${json.error}`)
          continue
        }
        added.push({ name: json.name, size: json.size, url: json.url, path: json.path, fileType: slotType })
      }
      setFiles(p => [...p, ...added])
    } finally {
      if (slotType) setUploadingSlot(null); else setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [router])

  const remove = async (path: string) => {
    setFiles(p => p.filter(f => f.path !== path))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    })
  }

  const parseText = () => {
    const lines = text.trim().split('\n')
    const theme = lines[0].trim()
    const special_instructions = lines.slice(1).join('\n').trim() || null
    return { theme, special_instructions }
  }

  // Step 1: click "Search →" — generate the plan and open the confirm dialog.
  // Nothing is created or dispatched yet.
  const requestPreview = async () => {
    if (!text.trim()) return
    const { theme, special_instructions } = parseText()
    setPreviewLoading(true); setPreviewError(null); setPlan(null); setDialogOpen(true)
    try {
      const res = await authedFetch('/api/preview-plan', {
        method: 'POST',
        body: JSON.stringify({
          theme, special_instructions,
          mode, geography: mode === 'EU_ONLY' ? 'Europe' : 'Global',
          stage: stages.length ? stages.join(', ') : 'Series A, Series B',
          seed_companies: seedText.trim() || null,
          icos_fit: icosFit, include_small: includeSmall, exhaustive,
        }),
      })
      const json = await res.json()
      if (!json.ok) { setPreviewError(json.error || 'Unknown error'); return }
      setPlan(json)
    } catch (e: any) {
      setPreviewError(e?.message ?? String(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  const closeDialog = () => { setDialogOpen(false); setPlan(null); setPreviewError(null) }

  // Step 2: user clicks Confirm in the dialog — NOW create + dispatch the run, immediately.
  const confirmAndRun = async () => {
    if (!text.trim()) return
    setSubmitting(true); setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const meta = session.user.user_metadata
    const { theme, special_instructions } = parseText()
    const slug = generateRunSlug(theme)
    const { data: runData, error: e } = await supabase.from('herb_runs').insert({
      user_id: session.user.id,
      submitted_by_email: session.user.email,
      submitted_by_name: meta?.full_name ?? meta?.name ?? null,
      slug, theme, special_instructions,
      geography: mode === 'EU_ONLY' ? 'Europe' : 'Global',
      // Stored as legacy DEEP/STANDARD to satisfy the herb_runs_search_mode_check
      // constraint; the prompt + UI treat these as Comprehensive / European-only.
      stage: stages.length ? stages.join(', ') : 'Series A/B',
      search_mode: mode === 'EU_ONLY' ? 'STANDARD' : 'DEEP',
      status: 'PENDING', current_round: 1,
      attachments: files.length ? files.map(f => ({ name: f.name, url: f.url })) : null,
      created_at: new Date().toISOString(),
      // Only include the new columns when they deviate from defaults, so the
      // insert keeps working until the 20260713 migration is applied.
      icos_fit: icosFit,   // column exists since v2 migration; explicit either way
      ...(seedText.trim() ? { seed_companies: seedText.trim() } : {}),
      ...(exhaustive && mode === 'COMPREHENSIVE' ? { exhaustive: true } : {}),
      // include_small column arrives with the 20260716 migration — only send when used
      ...(includeSmall ? { include_small: true } : {}),
    }).select('id').single()
    if (e) { setError('Could not submit: ' + e.message); setSubmitting(false); closeDialog(); return }

    // Link uploaded files to the new run in herb_files
    if (runData?.id && files.filter(f => f.fileType).length > 0) {
      try {
        const fileRows = files
          .filter(f => f.fileType)
          .map(f => ({
            user_id: session.user.id,
            run_id: runData.id,
            slot_type: f.fileType!,
            name: f.name,
            url: f.url,
            path: f.path,
            size: f.size,
            is_global: f.fileType === 'check-sites',
          }))
        await supabase.from('herb_files').upsert(fileRows, { onConflict: 'path' })
      } catch {
        // Non-fatal — files already in storage, just missing DB link
      }
    }

    router.push('/dashboard')
  }

  const fmt = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const ready = text.trim().length > 3 && !submitting && !uploading && !previewLoading

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 flex items-center gap-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/dashboard" className="text-sm" style={{ color: 'var(--muted)' }}>&#8592; Back</Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>New search</span>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text)' }}>What are you looking for?</h1>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
            Describe the startups in plain language. Herb searches globally and emails you a longlist.
          </p>

          <div className="rounded-2xl overflow-hidden transition-all"
            style={{
              background: 'var(--surface)',
              border: dragOver ? '1.5px solid var(--teal)' : '1.5px solid var(--border)',
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files) }}>

            <textarea ref={textRef} value={text}
              onChange={e => { setText(e.target.value); grow(e.target) }}
              onPaste={e => { if (e.clipboardData.files.length > 0) { e.preventDefault(); upload(e.clipboardData.files) } }}
              placeholder="e.g. Sustainable packaging startups in Europe at Series A, bio-based materials, not already in our pipeline..."
              disabled={submitting}
              className="w-full px-5 pt-5 pb-4 text-sm leading-relaxed resize-none outline-none"
              style={{ minHeight: '160px', height: '160px', background: 'transparent', color: 'var(--text)', caretColor: 'var(--teal)' }}
              autoFocus />

            {/* Labeled data file slots */}
            {slotError && (
              <p className="px-4 pt-2 text-xs" style={{ color: '#c0392b' }}>⚠ {slotError}</p>
            )}
            <div className="px-4 pb-3 pt-1 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {FILE_SLOTS.map(slot => {
                const slotFiles = files.filter(f => f.fileType === slot.key)
                const isUp = uploadingSlot === slot.key
                return (
                  <div key={slot.key} className="flex flex-col gap-1">
                    <input
                      id={`new-file-${slot.key}`}
                      type="file" accept=".xlsx,.xls,.csv" multiple
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files; if (f) upload(f, slot.key); e.target.value = '' }}
                    />
                    {slotFiles.map(sf => (
                      <div key={sf.path} className="flex flex-col gap-0.5 text-xs px-2.5 py-1.5 rounded-xl"
                        style={{ background: slot.chipBg, border: `1px solid ${slot.chipBorder}`, color: slot.chipColor }}>
                        <div className="flex items-center gap-1.5">
                          <span className="flex-shrink-0" style={{ fontSize: '11px' }}>✓</span>
                          <span className="truncate flex-1 font-medium" title={sf.name}>{sf.name}</span>
                          <button onClick={() => remove(sf.path)} className="flex-shrink-0" style={{ opacity: 0.5, fontSize: '14px', lineHeight: 1 }}>×</button>
                        </div>
                        {slot.key === 'check-sites' && (
                          <span style={{ fontSize: '10px', opacity: 0.8, paddingLeft: '16px' }}>🌐 applies to all searches</span>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => (document.getElementById(`new-file-${slot.key}`) as HTMLInputElement | null)?.click()}
                      disabled={isUp || submitting}
                      className="w-full flex flex-col items-center gap-0.5 px-2 rounded-xl text-xs transition-all"
                      style={{
                        background: isUp ? 'var(--teal-light)' : slotFiles.length > 0 ? 'var(--bg)' : 'var(--bg)',
                        border: isUp ? '1.5px solid var(--teal)' : slotFiles.length > 0 ? '1.5px solid var(--teal)' : '1px dashed var(--border)',
                        color: 'var(--subtle)', cursor: isUp ? 'default' : 'pointer',
                        paddingTop: slotFiles.length > 0 ? '5px' : '10px',
                        paddingBottom: slotFiles.length > 0 ? '5px' : '10px',
                        animation: isUp ? 'pulse 1s ease-in-out infinite' : 'none',
                      }}
                      onMouseEnter={e => { if (!isUp) e.currentTarget.style.borderColor = 'var(--teal)' }}
                      onMouseLeave={e => { if (!isUp && slotFiles.length === 0) e.currentTarget.style.borderColor = 'var(--border)' }}>
                      {isUp ? (
                        <>
                          <span className="loading-spinner" style={{ width: '13px', height: '13px', margin: '2px 0' }} />
                          <span style={{ color: 'var(--teal)', fontWeight: 500 }}>Uploading…</span>
                        </>
                      ) : (
                        <>
                          <span className="text-base">{slot.icon}</span>
                          <span className="font-medium" style={{ color: slotFiles.length > 0 ? 'var(--teal)' : 'var(--muted)' }}>
                            {slotFiles.length > 0 ? `+ add more (${slotFiles.length})` : slot.label}
                          </span>
                          {slotFiles.length === 0 && <span style={{ fontSize: '10px' }}>{slot.hint}</span>}
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            {/* General attachments (PDFs, briefs) + non-slot uploads */}
            {files.filter(f => !f.fileType).length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {files.filter(f => !f.fileType).map(f => (
                  <div key={f.path} className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    <span>📎</span>
                    <span className="max-w-[140px] truncate font-medium" style={{ color: 'var(--text)' }}>{f.name}</span>
                    <span>{fmt(f.size)}</span>
                    <button onClick={() => remove(f.path)} style={{ color: 'var(--subtle)' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Search scope toggle */}
            <div className="px-4 pt-3 pb-1" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                {([
                  { key: 'COMPREHENSIVE', label: '🌍 Comprehensive', hint: 'EU + Japan + USA · discovers new VC funds · all sources' },
                  { key: 'EU_ONLY', label: '🇪🇺 European VCs only', hint: 'Europe · curated VC shortlist · faster' },
                ] as const).map(opt => {
                  const active = mode === opt.key
                  return (
                    <button key={opt.key} type="button" onClick={() => setMode(opt.key)} disabled={submitting}
                      title={opt.hint}
                      className="flex-1 text-left px-3 py-2 rounded-xl transition-all"
                      style={{
                        background: active ? 'var(--teal-light)' : 'var(--bg)',
                        border: active ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                        cursor: submitting ? 'default' : 'pointer',
                      }}>
                      <div className="text-sm font-medium" style={{ color: active ? 'var(--teal)' : 'var(--text)' }}>{opt.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{opt.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Exhaustive search — deliberate, expensive opt-in (Comprehensive mode only) */}
            {mode === 'COMPREHENSIVE' && (
              <div className="px-4 pt-3 pb-1">
                <label className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer select-none transition-all"
                  style={{
                    background: exhaustive ? '#fdf6ec' : 'var(--bg)',
                    border: exhaustive ? '1.5px solid #b7600a' : '1px dashed var(--border)',
                  }}>
                  <input type="checkbox" checked={exhaustive} disabled={submitting}
                    onChange={e => setExhaustive(e.target.checked)}
                    style={{ accentColor: '#b7600a', marginTop: '2px' }} />
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    <strong style={{ color: exhaustive ? '#b7600a' : 'var(--text)', fontWeight: 800, letterSpacing: '0.02em' }}>
                      COMPREHENSIVE &amp; EXPENSIVE SEARCH
                    </strong>
                    <span className="block mt-0.5">
                      Queries the portfolio of <strong>every</strong> matching fund in the 5,070-fund
                      universe (broad themes: 400–900+ funds). Multi-hour run, roughly 5–10× normal cost.
                      For flagship mandates — the default already covers the 250 most relevant funds.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {/* Stage chips */}
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>Stage</span>
                {STAGE_OPTIONS.map(s => {
                  const on = stages.includes(s)
                  return (
                    <button key={s} type="button" disabled={submitting}
                      onClick={() => setStages(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                      className="text-xs px-2.5 py-1 rounded-full transition-all"
                      style={{
                        background: on ? 'var(--teal-light)' : 'var(--bg)',
                        border: on ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                        color: on ? 'var(--teal)' : 'var(--muted)',
                        fontWeight: on ? 600 : 400,
                        cursor: submitting ? 'default' : 'pointer',
                      }}>
                      {on ? '✓ ' : ''}{s}
                    </button>
                  )
                })}
                {stages.length === 0 && (
                  <span className="text-xs" style={{ color: '#b7600a' }}>none selected — defaults to Series A/B</span>
                )}
              </div>
            </div>

            {/* Sub-10-FTE inclusion — the 10 FTE maturity threshold applies to ALL searches by default */}
            <div className="px-4 pt-2 pb-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--muted)' }}>
                <input type="checkbox" checked={includeSmall} disabled={submitting}
                  onChange={e => setIncludeSmall(e.target.checked)}
                  style={{ accentColor: 'var(--teal)' }} />
                <span style={{ fontWeight: 500, color: includeSmall ? 'var(--teal)' : 'var(--muted)' }}>
                  Also include companies under 10 FTE
                </span>
                <span style={{ color: 'var(--subtle)' }}>
                  — by default Herb drops sub-10-FTE companies as too early; tick to keep them, tagged “Early”.
                </span>
              </label>
            </div>

            {/* Seed companies — known examples that define the thesis */}
            <div className="px-4 pt-2 pb-1">
              <input
                value={seedText}
                onChange={e => setSeedText(e.target.value)}
                disabled={submitting}
                placeholder="Companies you already know that fit (comma-separated, e.g. Vernaio, Ethos AI) — optional but sharpens the search"
                className="w-full text-xs px-3 py-2 rounded-xl outline-none transition-all"
                style={{
                  background: 'var(--bg)',
                  border: seedText.trim() ? '1.5px solid var(--teal)' : '1px solid var(--border)',
                  color: 'var(--text)', caretColor: 'var(--teal)',
                }}
              />
            </div>

            {/* Icos Fit toggle */}
            <div className="px-4 pt-2 pb-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: 'var(--muted)' }}>
                <input type="checkbox" checked={icosFit} disabled={submitting}
                  onChange={e => setIcosFit(e.target.checked)}
                  style={{ accentColor: 'var(--teal)' }} />
                <span style={{ fontWeight: 500, color: icosFit ? 'var(--teal)' : 'var(--muted)' }}>
                  Score Icos Fit (0–10)
                </span>
                <span style={{ color: 'var(--subtle)' }}>
                  — off by default (faster, cheaper raw longlist). Tick to score now, or score any completed run later via “★ Score Icos Fit” on its results page.
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-1.5">
                <input ref={fileRef} type="file" multiple className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.pptx,.ppt"
                  onChange={e => upload(e.target.files)} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading || submitting}
                  title="Attach brief / PDF / Word doc"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-light transition-all"
                  style={{ color: 'var(--subtle)' }}>📎</button>
                <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {uploading ? 'Uploading…' : 'Brief or context doc'}
                </span>
              </div>
              <button onClick={requestPreview} disabled={!ready}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all"
                style={{ background: ready ? 'var(--teal)' : 'var(--border)', color: ready ? '#fff' : 'var(--subtle)', cursor: ready ? 'pointer' : 'not-allowed' }}>
                {previewLoading ? 'Reading…' : submitting ? 'Submitting…' : 'Search →'}
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>}

          <div className="mt-8">
            <p className="text-xs font-medium mb-3 uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>Examples</p>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => { setText(ex); if (textRef.current) { textRef.current.focus(); grow(textRef.current) } }}
                  className="w-full text-left text-sm px-4 py-3 rounded-xl transition-all"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SearchPlanDialog
        open={dialogOpen}
        loading={previewLoading}
        error={previewError}
        plan={plan}
        confirming={submitting}
        onConfirm={confirmAndRun}
        onEdit={closeDialog}
        onRunWithoutPreview={() => { closeDialog(); confirmAndRun() }}
      />
    </div>
  )
}
