'use client'

export const dynamic = 'force-dynamic'

import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type AttachedFile = { name: string; size: number; url: string; path: string }

export default function NewMandatePage() {
  const [prompt, setPrompt] = useState('')
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 320) + 'px'
  }

  const handleFileAdd = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const added: AttachedFile[] = []
    for (const file of Array.from(fileList)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `mandates/${session.user.id}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from('herb-uploads').upload(path, file)
      if (upErr) { setError(`Upload failed: ${upErr.message}`); continue }
      const { data: { publicUrl } } = supabase.storage.from('herb-uploads').getPublicUrl(path)
      added.push({ name: file.name, size: file.size, url: publicUrl, path })
    }
    setFiles(prev => [...prev, ...added])
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [router])

  const removeFile = async (path: string) => {
    setFiles(prev => prev.filter(f => f.path !== path))
    await supabase.storage.from('herb-uploads').remove([path])
  }

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setSubmitting(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const lines = prompt.trim().split('\n')
    const theme = lines[0].trim()
    const special_instructions = lines.slice(1).join('\n').trim() || null
    const date = new Date().toISOString().split('T')[0]
    const slug = `${date}-${theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`
    const attachments = files.length > 0 ? files.map(f => ({ name: f.name, url: f.url })) : null
    const { error: dbErr } = await supabase.from('herb_runs').insert({
      user_id: session.user.id, slug, theme, special_instructions,
      geography: 'Europe', stage: 'Series A/B', search_mode: 'DEEP',
      status: 'PENDING', current_round: 1, attachments,
      created_at: new Date().toISOString(),
    })
    if (dbErr) { setError('Submit failed: ' + dbErr.message); setSubmitting(false); return }
    router.push('/dashboard')
  }

  const fmt = (b: number) => b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const canSubmit = prompt.trim().length > 0 && !submitting && !uploading

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600 text-sm">
            &larr; Back
          </button>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-800">&#127807; Herb</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-semibold text-slate-800 mb-2 text-center">What are you looking for?</h1>
          <p className="text-slate-400 text-sm text-center mb-8">
            Describe the startups you want. Herb searches globally and emails you a longlist.
          </p>

          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            onDrop={e => { e.preventDefault(); handleFileAdd(e.dataTransfer.files) }}
            onDragOver={e => e.preventDefault()}
          >
            <textarea
              value={prompt}
              onChange={handleTextChange}
              onPaste={e => { if (e.clipboardData.files.length > 0) { e.preventDefault(); handleFileAdd(e.clipboardData.files) } }}
              placeholder="e.g. Sustainable packaging startups in Europe at Series A, bio-based materials, not already in our pipeline..."
              className="w-full px-5 pt-5 pb-3 text-slate-800 placeholder-slate-400 resize-none outline-none text-base leading-relaxed min-h-[140px]"
              style={{ height: '140px' }}
              autoFocus
              disabled={submitting}
            />

            {files.length > 0 && (
              <div className="px-5 pb-3 flex flex-wrap gap-2">
                {files.map(f => (
                  <div key={f.path} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-slate-500">&#128206;</span>
                    <span className="truncate max-w-[160px] text-slate-700">{f.name}</span>
                    <span className="text-slate-400 text-xs">{fmt(f.size)}</span>
                    <button onClick={() => removeFile(f.path)} className="text-slate-400 hover:text-red-500 text-xs font-bold ml-1">&#10005;</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.pptx,.ppt"
                  className="hidden"
                  onChange={e => handleFileAdd(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || submitting}
                  title="Attach files (PDF, Excel, Word, CSV)"
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 font-light border border-transparent hover:border-slate-200"
                >+</button>
                {uploading && <span className="text-xs text-slate-400">Uploading...</span>}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="bg-slate-900 hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
              >
                {submitting ? 'Submitting...' : 'Search'}
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-red-600 text-center">{error}</p>}

          <p className="text-center text-xs text-slate-400 mt-4">
            Attach reference files, longlists, or decks for extra context &middot; Results arrive by email
          </p>
        </div>
      </div>
    </div>
  )
}
