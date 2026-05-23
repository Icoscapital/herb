'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Attachment = { name: string; size: number; url: string; path: string }

const EXAMPLES = [
  'Sustainable packaging startups in Europe, Series A, using bio-based or recycled materials',
  'B2B SaaS tools for supply chain visibility, pre-Series A, Netherlands or Germany',
  'Alt-protein companies working on fermentation, not yet in our pipeline',
]

export default function NewMandatePage() {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
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

  const upload = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const added: Attachment[] = []
    for (const f of Array.from(list)) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `mandates/${session.user.id}/${Date.now()}-${safe}`
      const { error: e } = await supabase.storage.from('herb-uploads').upload(path, f)
      if (e) { setError(`Could not upload ${f.name}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('herb-uploads').getPublicUrl(path)
      added.push({ name: f.name, size: f.size, url: publicUrl, path })
    }
    setFiles(p => [...p, ...added])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [router])

  const remove = async (path: string) => {
    setFiles(p => p.filter(f => f.path !== path))
    await supabase.storage.from('herb-uploads').remove([path])
  }

  const submit = async () => {
    if (!text.trim()) return
    setSubmitting(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const lines = text.trim().split('\n')
    const theme = lines[0].trim()
    const special_instructions = lines.slice(1).join('\n').trim() || null
    const date = new Date().toISOString().split('T')[0]
    const slug = `${date}-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`
    const { error: e } = await supabase.from('herb_runs').insert({
      user_id: session.user.id, slug, theme, special_instructions,
      geography: 'Europe', stage: 'Series A/B', search_mode: 'DEEP',
      status: 'PENDING', current_round: 1,
      attachments: files.length ? files.map(f => ({ name: f.name, url: f.url })) : null,
      created_at: new Date().toISOString(),
    })
    if (e) { setError('Could not submit: ' + e.message); setSubmitting(false); return }
    router.push('/dashboard')
  }

  const fmt = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const ready = text.trim().length > 3 && !submitting && !uploading

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Top bar */}
      <header className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'var(--muted)' }}>
          <span>&#8592;</span> Back
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>New search mandate</span>
      </header>

      {/* Main compose area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">

          {/* Heading */}
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text)' }}>
            What are you looking for?
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--muted)' }}>
            Describe the startups in plain language. Herb will search globally and email you a longlist.
          </p>

          {/* Compose box */}
          <div
            className="rounded-2xl overflow-hidden transition-all"
            style={{
              background: 'var(--surface)',
              border: dragOver ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files) }}
          >
            <textarea
              ref={textRef}
              value={text}
              onChange={e => { setText(e.target.value); grow(e.target) }}
              onPaste={e => {
                if (e.clipboardData.files.length > 0) {
                  e.preventDefault()
                  upload(e.clipboardData.files)
                }
              }}
              placeholder="e.g. Sustainable packaging startups in Europe at Series A, using bio-based materials, not already in our pipeline..."
              disabled={submitting}
              className="w-full px-5 pt-5 pb-4 text-sm leading-relaxed resize-none outline-none"
              style={{
                minHeight: '160px',
                height: '160px',
                background: 'transparent',
                color: 'var(--text)',
                caretColor: 'var(--accent)',
              }}
              autoFocus
            />

            {/* Attached files */}
            {files.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {files.map(f => (
                  <div key={f.path}
                    className="flex items-center gap-2 text-xs rounded-lg px-3 py-1.5"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                    <span style={{ fontSize: '13px' }}>&#128206;</span>
                    <span className="max-w-[140px] truncate font-medium" style={{ color: 'var(--text)' }}>{f.name}</span>
                    <span>{fmt(f.size)}</span>
                    <button onClick={() => remove(f.path)}
                      className="transition-colors ml-0.5"
                      style={{ color: 'var(--subtle)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--subtle)')}
                    >&#10005;</button>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1">
                {/* Attach button */}
                <input ref={fileRef} type="file" multiple className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.pptx,.ppt"
                  onChange={e => upload(e.target.files)} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || submitting}
                  title="Attach files"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all"
                  style={{ color: 'var(--subtle)', background: 'transparent' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--subtle)' }}
                >+</button>
                {uploading && (
                  <span className="text-xs ml-1" style={{ color: 'var(--subtle)' }}>Uploading…</span>
                )}
                {!uploading && files.length === 0 && (
                  <span className="text-xs ml-1" style={{ color: 'var(--subtle)' }}>Attach files for context</span>
                )}
              </div>
              <button
                onClick={submit}
                disabled={!ready}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-all"
                style={{
                  background: ready ? 'var(--accent)' : 'var(--border)',
                  color: ready ? '#fff' : 'var(--subtle)',
                  cursor: ready ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting ? <><div className="loading-spinner" style={{ width: '14px', height: '14px', borderColor: '#ccc', borderTopColor: '#fff' }} /> Submitting…</> : 'Search &#8594;'}
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>}

          {/* Example prompts */}
          <div className="mt-8">
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--subtle)' }}>EXAMPLES</p>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button key={i}
                  onClick={() => { setText(ex); if (textRef.current) { textRef.current.focus(); grow(textRef.current) } }}
                  className="w-full text-left text-sm px-4 py-3 rounded-xl transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)' }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
