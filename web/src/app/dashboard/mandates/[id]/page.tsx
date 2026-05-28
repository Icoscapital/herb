'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx-js-style'
import { supabase } from '@/lib/supabase'
import { authedFetch } from '@/lib/api-client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type FileSlot = { type: 'pitchbook' | 'company-list' | 'check-sites'; name: string; url: string; path: string; size: number; isGlobal?: boolean }
const FILE_SLOTS: { key: FileSlot['type']; label: string; hint: string; icon: string; chipBg: string; chipBorder: string; chipColor: string }[] = [
  { key: 'pitchbook',    label: 'PitchBook export', hint: '.xlsx export from PitchBook',             icon: '📊', chipBg: '#e8f0fc', chipBorder: '#2471a3', chipColor: '#2471a3' },
  { key: 'company-list', label: 'Company list',     hint: 'Your own list of companies (.xlsx/.csv)',  icon: '📋', chipBg: '#e8edf5', chipBorder: '#1a2b4a', chipColor: '#1a2b4a' },
  { key: 'check-sites',  label: 'Check sites',      hint: 'Sites/portfolios to search (.xlsx/.csv)',  icon: '🌐', chipBg: '#e8f5ee', chipBorder: '#1e8449', chipColor: '#1e8449' },
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
  current_round: number | null
  slug: string | null
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

// Return a usable URL or null. Strips "Unknown", whitespace, junk values.
function validUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'n/a' || s === '-' || s === '—') return null
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  // Looks like a bare domain (contains a dot, no spaces)
  if (s.includes('.') && !s.includes(' ')) return `https://${s}`
  return null
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
  // Full instruction editor for next round
  const [showInstructionEditor, setShowInstructionEditor] = useState(false)
  const [nextInstructions, setNextInstructions] = useState('')
  // File upload for round 2
  const [uploadedFiles, setUploadedFiles] = useState<FileSlot[]>([])
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // Pipedrive push per-company
  const [pushingPd, setPushingPd] = useState<string | null>(null)            // company_id currently being pushed
  const [pdToast, setPdToast] = useState<{ ok: boolean; text: string; url?: string } | null>(null)
  // Manual company add
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualWebsite, setManualWebsite] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  // Mark complete
  const [completing, setCompleting] = useState(false)
  // Edit & re-run
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  // Earlier rounds of the same mandate lineage (slug base match, lower current_round)
  const [previousRounds, setPreviousRounds] = useState<Array<{ id: string; current_round: number | null; result_count: number | null; status: string; created_at: string }>>([])
  const editRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: r } = await supabase.from('herb_runs').select('*').eq('id', params.id).single()
      if (!r) { router.push('/dashboard'); return }
      setRun(r)

      // Fetch earlier rounds in the same lineage (same slug base, lower current_round)
      try {
        const baseSlug = (r.slug as string | null)?.replace(/-rd+$/, '') ?? null
        const thisRound = r.current_round ?? 1
        if (baseSlug) {
          const { data: siblings } = await supabase
            .from('herb_runs')
            .select('id,slug,current_round,result_count,status,created_at')
            .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-r%`)
            .neq('id', r.id)
            .order('current_round', { ascending: true })
          const earlier = (siblings ?? []).filter(s => (s.current_round ?? 1) < thisRound)
          setPreviousRounds(earlier)
        }
      } catch {
        // non-fatal
      }

      const { data: c } = await supabase.from('herb_longlist').select('*')
        .eq('run_id', params.id).order('score', { ascending: false })
      setCompanies(c ?? [])

      // Load persisted files for this run + global check-sites for this user
      try {
        const { data: runFiles } = await supabase
          .from('herb_files')
          .select('*')
          .eq('run_id', params.id)
        const { data: globalFiles } = await supabase
          .from('herb_files')
          .select('*')
          .eq('is_global', true)
          .eq('user_id', session.user.id)
        const allFiles: FileSlot[] = []
        for (const f of runFiles ?? []) {
          allFiles.push({ type: f.slot_type as FileSlot['type'], name: f.name, url: f.url, path: f.path, size: f.size ?? 0, isGlobal: f.is_global })
        }
        // Add global check-sites not already in runFiles
        const runPaths = new Set((runFiles ?? []).map((f: any) => f.path))
        for (const f of globalFiles ?? []) {
          if (!runPaths.has(f.path)) {
            allFiles.push({ type: f.slot_type as FileSlot['type'], name: f.name, url: f.url, path: f.path, size: f.size ?? 0, isGlobal: true })
          }
        }
        if (allFiles.length > 0) setUploadedFiles(allFiles)
      } catch {
        // herb_files table may not exist yet — non-fatal
      }

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

  const pushToPipedrive = useCallback(async (companyId: string) => {
    setPushingPd(companyId)
    setPdToast(null)
    try {
      const res = await authedFetch('/api/push-to-pipedrive', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId }),
      })
      const json = await res.json()
      if (!json.ok) {
        setPdToast({ ok: false, text: json.error || 'Push failed' })
      } else {
        // Optimistically update the local notes so the row chip flips immediately.
        const marker = `Pipedrive: ${json.status === 'exists' ? (json.deal_status ?? 'Open') : 'New'} | Deal #${json.deal_id}`
        setCompanies(prev => prev.map(c =>
          c.id === companyId
            ? { ...c, notes: marker + (c.notes ? ` | ${c.notes.replace(/Pipedrive:\s*[^|]*\|?\s*/i, '').trim()}` : '') }
            : c
        ))
        setPdToast({
          ok: true,
          text: json.status === 'exists' ? `Already in Pipedrive — Deal #${json.deal_id}` : `Created Deal #${json.deal_id}`,
          url: json.deal_url,
        })
      }
    } catch (e: any) {
      setPdToast({ ok: false, text: String(e?.message ?? e) })
    } finally {
      setPushingPd(null)
    }
  }, [])

  const uploadFiles = useCallback(async (slotKey: string, fileList: FileList) => {
    const fileArr = Array.from(fileList)  // Capture before any await — FileList is cleared when input.value resets
    if (!fileArr.length) return
    setUploadingSlot(slotKey)
    setUploadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const slotType = slotKey as FileSlot['type']
      const isGlobal = slotKey === 'check-sites'
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i]
        const fd = new FormData()
        fd.append('file', file)
        fd.append('slotType', slotKey)
        fd.append('index', String(i))
        fd.append('runId', params.id)   // link to this run
        fd.append('isGlobal', String(isGlobal))
        let json: any
        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: fd,
          })
          json = await res.json()
        } catch (fetchErr: any) {
          setUploadError(`Upload failed: ${fetchErr?.message ?? 'network error'}`)
          continue
        }
        if (!json.ok) {
          setUploadError(`Could not upload ${file.name}: ${json.error}`)
        } else {
          setUploadedFiles(prev => [...prev, { type: slotType, name: json.name, url: json.url, path: json.path, size: json.size, isGlobal }])
        }
      }
    } finally {
      setUploadingSlot(null)
    }
  }, [params.id])

  const removeFile = async (slot: FileSlot) => {
    setUploadedFiles(prev => prev.filter(f => f.path !== slot.path))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/upload', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ path: slot.path }),
    })
  }

  const submitFeedback = async () => {
    if (!feedbackText.trim() && excluded.size === 0) return
    setSubmitting(true)
    setFeedbackError(null)
    try {
      const res = await authedFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          run_id: params.id,
          feedback_text: showInstructionEditor ? '' : feedbackText,
          excluded_companies: showInstructionEditor ? [] : Array.from(excluded),
          attachments: uploadedFiles.length ? uploadedFiles.map(f => ({ type: f.type, name: f.name, url: f.url })) : null,
          ...(showInstructionEditor && nextInstructions.trim() ? { override_instructions: nextInstructions.trim() } : {}),
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

  const openEdit = () => {
    if (!run) return
    const txt = [run.theme, run.special_instructions].filter(Boolean).join('\n')
    setEditText(txt)
    setEditMode(true)
    setTimeout(() => { if (editRef.current) { editRef.current.focus(); editRef.current.style.height = 'auto'; editRef.current.style.height = Math.min(editRef.current.scrollHeight, 320) + 'px' } }, 50)
  }

  const saveEdit = async () => {
    if (!editText.trim() || !run) return
    setEditSaving(true)
    const lines = editText.trim().split('\n')
    const theme = lines[0].trim()
    const special_instructions = lines.slice(1).join('\n').trim() || null
    try {
      if (run.status === 'PENDING') {
        // Update in place and re-queue
        const { error } = await supabase.from('herb_runs')
          .update({ theme, special_instructions })
          .eq('id', params.id)
        if (error) { alert('Could not update: ' + error.message); return }
        setRun(r => r ? { ...r, theme, special_instructions } : r)
        setEditMode(false)
        // Re-queue the run
        authedFetch('/api/run-mandate', { method: 'POST', body: JSON.stringify({ run_id: params.id }) }).catch(() => {})
      } else {
        // Create a fresh new run and go back to dashboard
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const date = new Date().toISOString().split('T')[0]
        const slug = `${date}-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`
        const { error } = await supabase.from('herb_runs').insert({
          user_id: session.user.id,
          submitted_by_email: session.user.email,
          submitted_by_name: run.submitted_by_name,
          slug, theme, special_instructions,
          geography: run.geography, stage: run.stage, search_mode: run.search_mode,
          status: 'PENDING', current_round: 1,
          created_at: new Date().toISOString(),
        })
        if (error) { alert('Could not create run: ' + error.message); return }
        router.push('/dashboard')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const markComplete = async () => {
    if (!run) return
    setCompleting(true)
    const { error } = await supabase
      .from('herb_runs')
      .update({ status: 'COMPLETED' })
      .eq('id', params.id)
    if (error) {
      alert('Could not mark as completed: ' + error.message)
      setCompleting(false)
      return
    }
    setRun(r => r ? { ...r, status: 'COMPLETED' } : r)
    setCompleting(false)
  }

  const addManualCompany = async () => {
    if (!manualName.trim()) return
    setAddingManual(true)
    const website = manualWebsite.trim() || null
    const { data, error } = await supabase
      .from('herb_longlist')
      .insert({
        run_id: params.id,
        name: manualName.trim(),
        website,
        description: null,
        geography: null,
        stage: null,
        score: null,
        linkedin: null,
        notes: 'Manually added',
        source: 'Manual',
      })
      .select('*')
      .single()
    if (error) {
      alert('Could not add company: ' + error.message)
    } else if (data) {
      setCompanies(prev => [data, ...prev])
      setManualName('')
      setManualWebsite('')
      setShowManualAdd(false)
    }
    setAddingManual(false)
  }

  const download = async () => {
    if (!run || companies.length === 0) return
    setDownloading(true)
    const cols = ['name', 'description', 'website', 'linkedin', 'stage', 'geography', 'score', 'source', 'notes'] as const
    const headers = ['Company', 'Description', 'Website', 'LinkedIn', 'Stage', 'Geography', 'Score', 'Source', 'Notes']
    const colWidths = [25, 60, 35, 35, 14, 14, 8, 20, 60]
    const rows = companies.map(c => cols.map(k => c[k] ?? ''))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    // Column widths
    ws['!cols'] = colWidths.map(w => ({ wch: w }))
    // Freeze top row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    // Auto-filter
    ws['!autofilter'] = { ref: `A1:I1` }
    // Bold + navy headers
    for (let c = 0; c < headers.length; c++) {
      const cell = XLSX.utils.encode_cell({ r: 0, c })
      if (ws[cell]) ws[cell].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1A2B4A' } } }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Longlist')
    XLSX.writeFile(wb, `herb-${run.theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.xlsx`)
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
              : <>↓ Excel ({companies.length})</>}
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
          <button
            onClick={editMode ? () => setEditMode(false) : openEdit}
            className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full transition-all"
            style={{
              border: '1px solid var(--border)', color: editMode ? 'var(--teal)' : 'var(--muted)',
              borderColor: editMode ? 'var(--teal)' : 'var(--border)', background: 'transparent',
            }}
          >
            {editMode ? '✕ cancel' : '✎ edit'}
          </button>
        </div>

        {/* Pipedrive push toast */}
        {pdToast && (
          <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm"
            style={{
              background: pdToast.ok ? 'var(--teal-light)' : '#fdf2f1',
              color: pdToast.ok ? 'var(--teal)' : '#c0392b',
              border: `1px solid ${pdToast.ok ? 'var(--teal)' : '#e74c3c'}`,
            }}>
            <span className="flex items-center gap-2">
              {pdToast.ok ? '✓' : '⚠'} {pdToast.text}
              {pdToast.url && (
                <a href={pdToast.url} target="_blank" rel="noopener noreferrer"
                  className="underline font-medium" style={{ color: 'inherit' }}>
                  Open in Pipedrive ↗
                </a>
              )}
            </span>
            <button onClick={() => setPdToast(null)} style={{ opacity: 0.6, fontSize: '16px', lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Previous rounds */}
        {previousRounds.length > 0 && (
          <div className="flex items-center gap-2 mb-6 text-xs flex-wrap">
            <span style={{ color: 'var(--subtle)' }}>Previous rounds:</span>
            {previousRounds.map(pr => (
              <a key={pr.id} href={`/dashboard/mandates/${pr.id}`}
                className="px-2.5 py-1 rounded-full transition-all hover:shadow-sm"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                R{pr.current_round ?? 1} · {pr.result_count ?? 0} companies
              </a>
            ))}
          </div>
        )}

        {/* Edit panel */}
        {editMode && (
          <div className="mb-6 rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1.5px solid var(--teal)' }}>
            <textarea
              ref={editRef}
              value={editText}
              onChange={e => { setEditText(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 320) + 'px' }}
              className="w-full px-5 pt-5 pb-3 text-sm leading-relaxed resize-none outline-none"
              style={{ minHeight: '100px', background: 'transparent', color: 'var(--text)', caretColor: 'var(--teal)', fontFamily: 'inherit' }}
              placeholder="Describe what you're looking for…"
            />
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                {run.status === 'PENDING' ? 'Will update this search and re-queue it' : 'Will create a new search with this text'}
              </p>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editText.trim()}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all"
                style={{
                  background: editText.trim() ? 'var(--teal)' : 'var(--border)',
                  color: editText.trim() ? '#fff' : 'var(--subtle)',
                  cursor: editText.trim() && !editSaving ? 'pointer' : 'not-allowed',
                }}
              >
                {editSaving ? 'Saving…' : run.status === 'PENDING' ? '↻ Update & re-queue' : '+ New search with this text'}
              </button>
            </div>
          </div>
        )}

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
              const url = validUrl(co.website) ?? validUrl(co.linkedin)
              const pipedrive = co.notes?.match(/Pipedrive:\s*([^|]+)/)?.[1]?.trim() ?? 'New'
              const dealIdMatch = co.notes?.match(/Deal\s*#(\d+)/i)
              const pdDealId = dealIdMatch ? parseInt(dealIdMatch[1], 10) : null
              const pdStatusLower = pipedrive.toLowerCase()
              const isLost = pdStatusLower.includes('lost')
              const isPushing = pushingPd === co.id
              // "Already linked" means we have a deal id OR the status is anything other than the default "New" + no deal yet.
              const alreadyLinked = pdDealId !== null || isLost || pdStatusLower.includes('open') || pdStatusLower.includes('won')

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
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-sm font-semibold truncate"
                            style={{ color: 'var(--text)', textDecoration: 'underline', textDecorationColor: 'var(--border)', textUnderlineOffset: '3px' }}
                            title={url}
                          >
                            {co.name}
                          </a>
                        ) : (
                          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                            {co.name}
                          </span>
                        )}
                        {url && (
                          <span className="flex-shrink-0 text-xs" style={{ color: 'var(--subtle)' }}>↗</span>
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

                  {/* Pipedrive — interactive: shows status if linked, else a "+ Push" button */}
                  <div className="text-xs truncate">
                    {alreadyLinked ? (
                      pdDealId ? (
                        <a
                          href={`https://icoscapital.pipedrive.com/deal/${pdDealId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open Deal #${pdDealId} in Pipedrive`}
                          className="underline"
                          style={{ color: isLost ? '#c0392b' : 'var(--teal)' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {isLost ? `Lost · #${pdDealId}` : `✓ #${pdDealId}`}
                        </a>
                      ) : (
                        <span style={{ color: isLost ? '#c0392b' : 'var(--subtle)' }}>
                          {isLost ? 'Lost' : pipedrive}
                        </span>
                      )
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); pushToPipedrive(co.id) }}
                        disabled={isPushing || isExcluded}
                        title="Create deal in Pipedrive"
                        className="text-xs px-2 py-0.5 rounded-full transition-all"
                        style={{
                          background: isPushing ? 'var(--teal-light)' : 'transparent',
                          color: isPushing ? 'var(--teal)' : 'var(--teal)',
                          border: '1px solid var(--teal)',
                          cursor: isPushing || isExcluded ? 'not-allowed' : 'pointer',
                          opacity: isExcluded ? 0.4 : 1,
                        }}>
                        {isPushing ? '…' : '+ Push'}
                      </button>
                    )}
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

        {/* Manual company add */}
        {companies.length > 0 && run.status !== 'COMPLETED' && (
          <div className="mt-4">
            {!showManualAdd ? (
              <button
                onClick={() => setShowManualAdd(true)}
                className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                style={{ color: 'var(--muted)', border: '1px dashed var(--border)', background: 'transparent' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
              >
                + Add a company manually
              </button>
            ) : (
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--text)' }}>Add company to this list</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="Company name *"
                    className="flex-1 text-sm rounded-lg px-3 py-2 outline-none min-w-[150px]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onKeyDown={e => e.key === 'Enter' && addManualCompany()}
                  />
                  <input
                    value={manualWebsite}
                    onChange={e => setManualWebsite(e.target.value)}
                    placeholder="Website (optional)"
                    className="flex-1 text-sm rounded-lg px-3 py-2 outline-none min-w-[150px]"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    onKeyDown={e => e.key === 'Enter' && addManualCompany()}
                  />
                  <button
                    onClick={addManualCompany}
                    disabled={addingManual || !manualName.trim()}
                    className="text-sm font-medium px-4 py-2 rounded-lg transition-all"
                    style={{
                      background: manualName.trim() ? 'var(--teal)' : 'var(--border)',
                      color: manualName.trim() ? '#fff' : 'var(--subtle)',
                      cursor: manualName.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {addingManual ? '…' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setShowManualAdd(false); setManualName(''); setManualWebsite('') }}
                    className="text-sm px-3 py-2 rounded-lg transition-all"
                    style={{ color: 'var(--subtle)', background: 'transparent' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Feedback / round N+1 panel */}
        {companies.length > 0 && (
          <div className="mt-6 rounded-2xl px-6 py-5"
            style={{ background: 'var(--surface)', border: `1px solid ${run.status === 'COMPLETED' ? 'var(--teal)' : 'var(--border)'}` }}>

            {run.status === 'COMPLETED' ? (
              <div className="flex items-center gap-3">
                <span style={{ fontSize: '20px' }}>✓</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--teal)' }}>Search completed</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    This search has been marked as complete. Download the final Excel above.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      Start round {(run.current_round ?? 1) + 1}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      Exclude companies with ×, describe adjustments, then rerun. Or mark complete if you're done.
                    </p>
                  </div>
                  <button
                    onClick={markComplete}
                    disabled={completing}
                    className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      border: '1px solid var(--border)',
                      color: 'var(--muted)',
                      background: 'transparent',
                      cursor: completing ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!completing) { e.currentTarget.style.borderColor = 'var(--teal)'; e.currentTarget.style.color = 'var(--teal)' } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                  >
                    {completing ? '…' : '✓ Mark as completed'}
                  </button>
                </div>

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

                {/* Mode toggle */}
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => setShowInstructionEditor(false)}
                    className="text-xs font-medium pb-1 transition-all"
                    style={{ color: !showInstructionEditor ? 'var(--text)' : 'var(--subtle)', borderBottom: !showInstructionEditor ? '2px solid var(--teal)' : '2px solid transparent' }}
                  >
                    Adjustments
                  </button>
                  <button
                    onClick={() => {
                      if (!showInstructionEditor) {
                        // Pre-fill with current instructions so user has a starting point
                        const base = [run.theme, run.special_instructions].filter(Boolean).join('\n')
                        setNextInstructions(base)
                      }
                      setShowInstructionEditor(true)
                    }}
                    className="text-xs font-medium pb-1 transition-all"
                    style={{ color: showInstructionEditor ? 'var(--text)' : 'var(--subtle)', borderBottom: showInstructionEditor ? '2px solid var(--teal)' : '2px solid transparent' }}
                  >
                    ✎ Full rewrite
                  </button>
                </div>

                {!showInstructionEditor ? (
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
                ) : (
                  <textarea
                    value={nextInstructions}
                    onChange={e => setNextInstructions(e.target.value)}
                    placeholder="Write the complete instructions for the next search from scratch…"
                    rows={5}
                    className="w-full text-sm rounded-xl px-4 py-3 resize-none outline-none"
                    style={{
                      background: 'var(--bg)', border: '1.5px solid var(--teal)',
                      color: 'var(--text)', fontFamily: 'inherit',
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--teal)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  />
                )}

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
                            display: 'flex', flexDirection: 'column', gap: '2px',
                            fontSize: '12px', padding: '5px 10px', borderRadius: '10px',
                            background: slot.chipBg, border: `1px solid ${slot.chipBorder}`, color: slot.chipColor,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ flexShrink: 0, fontSize: '11px' }}>✓</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}
                                title={sf.name}>{sf.name}</span>
                              <button onClick={() => removeFile(sf)}
                                style={{ color: slot.chipColor, opacity: 0.6, flexShrink: 0, lineHeight: 1, fontSize: '14px' }}>×</button>
                            </div>
                            {sf.isGlobal && (
                              <span style={{ fontSize: '10px', opacity: 0.8, paddingLeft: '16px' }}>🌐 applies to all searches</span>
                            )}
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
                    ✓ Round {(run.current_round ?? 1) + 1} queued — returning to dashboard…
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-end">
                    <button onClick={submitFeedback}
                      disabled={submitting || (!showInstructionEditor && !feedbackText.trim() && excluded.size === 0) || (showInstructionEditor && !nextInstructions.trim())}
                      className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
                      style={{
                        background: (showInstructionEditor ? nextInstructions.trim() : (feedbackText.trim() || excluded.size > 0)) ? 'var(--teal)' : 'var(--border)',
                        color: (showInstructionEditor ? nextInstructions.trim() : (feedbackText.trim() || excluded.size > 0)) ? '#fff' : 'var(--subtle)',
                        cursor: (showInstructionEditor ? nextInstructions.trim() : (feedbackText.trim() || excluded.size > 0)) ? 'pointer' : 'not-allowed',
                      }}>
                      {submitting
                        ? <><div className="loading-spinner" style={{ width: '13px', height: '13px', borderTopColor: '#fff' }} /> Creating…</>
                        : `↻ Start round ${(run.current_round ?? 1) + 1}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
