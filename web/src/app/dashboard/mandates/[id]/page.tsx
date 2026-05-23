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
}
type Run = {
  id: string; theme: string; status: string
  geography: string; stage: string
  special_instructions: string | null; created_at: string
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: r } = await supabase.from('herb_runs').select('*')
        .eq('id', params.id).eq('user_id', session.user.id).single()
      if (!r) { router.push('/dashboard'); return }
      setRun(r)
      const { data: c } = await supabase.from('herb_longlist').select('*')
        .eq('run_id', params.id).order('score', { ascending: false })
      setCompanies(c ?? [])
      setLoading(false)
    }
    load()
  }, [params.id, router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="loading-spinner" />
    </div>
  )
  if (!run) return null

  const date = new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="px-6 py-4 sticky top-0 z-10 flex items-center gap-3"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/dashboard" className="text-sm transition-colors" style={{ color: 'var(--muted)' }}>
          &#8592; All searches
        </Link>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{run.theme}</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Meta */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 text-xs mb-2" style={{ color: 'var(--subtle)' }}>
            <span>{run.geography}</span><span>&middot;</span>
            <span>{run.stage}</span><span>&middot;</span>
            <span>{date}</span>
          </div>
          {run.special_instructions && (
            <p className="text-sm p-3 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)' }}>Brief:</strong> {run.special_instructions}
            </p>
          )}
        </div>

        {/* Count bar */}
        {companies.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
              {companies.length} companies found
            </p>
          </div>
        )}

        {/* Companies */}
        {companies.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Results not yet available. Herb may still be searching.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((co, i) => (
              <div key={co.id} className="rounded-xl px-5 py-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-start gap-4">
                  <span className="text-xs pt-0.5 w-5 text-right flex-shrink-0" style={{ color: 'var(--subtle)' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{co.name}</span>
                      {co.score !== null && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {co.score}/10
                        </span>
                      )}
                      {co.stage && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--bg)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                          {co.stage}
                        </span>
                      )}
                    </div>
                    {co.description && (
                      <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>{co.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--subtle)' }}>
                      {co.geography && <span>&#128205; {co.geography}</span>}
                      {co.website && (
                        <a href={co.website} target="_blank" rel="noopener noreferrer"
                          className="underline" style={{ color: 'var(--accent)' }}>Website</a>
                      )}
                      {co.linkedin && (
                        <a href={co.linkedin} target="_blank" rel="noopener noreferrer"
                          className="underline" style={{ color: 'var(--accent)' }}>LinkedIn</a>
                      )}
                    </div>
                    {co.notes && <p className="text-xs mt-1.5 italic" style={{ color: 'var(--subtle)' }}>{co.notes}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}