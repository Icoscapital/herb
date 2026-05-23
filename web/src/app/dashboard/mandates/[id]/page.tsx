'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Company = {
  id: string
  name: string
  website: string | null
  description: string | null
  geography: string | null
  stage: string | null
  score: number | null
  linkedin: string | null
  notes: string | null
}

type Run = {
  id: string; theme: string; slug: string; status: string
  geography: string; stage: string; search_mode: string
  special_instructions: string | null; created_at: string
}

export default function MandateResultsPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<Run | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: runData } = await supabase
        .from('herb_runs')
        .select('*')
        .eq('id', params.id)
        .eq('user_id', session.user.id)
        .single()
      if (!runData) { router.push('/dashboard'); return }
      setRun(runData)
      const { data: companyData } = await supabase
        .from('herb_longlist')
        .select('*')
        .eq('run_id', params.id)
        .order('score', { ascending: false })
      setCompanies(companyData ?? [])
      setLoading(false)
    }
    load()
  }, [params.id, router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="loading-spinner" />
    </div>
  )
  if (!run) return null

  const date = new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-400 hover:text-slate-600 text-sm">&larr; All searches</Link>
          <span className="text-slate-300">|</span>
          <span className="font-semibold text-slate-800">&#127807; Herb</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{run.theme}</h1>
          <div className="flex flex-wrap gap-x-3 text-sm text-slate-500 mt-2">
            <span>{run.geography}</span><span>&middot;</span>
            <span>{run.stage}</span><span>&middot;</span>
            <span>{date}</span><span>&middot;</span>
            <span className="text-green-600 font-medium">{companies.length} companies found</span>
          </div>
          {run.special_instructions && (
            <p className="mt-3 text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
              <span className="font-medium">Instructions:</span> {run.special_instructions}
            </p>
          )}
        </div>

        {companies.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">No results yet. Herb may still be searching.</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sm text-slate-500 hover:text-slate-700 underline">Back to dashboard</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((co, i) => (
              <div key={co.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start gap-4">
                  <span className="text-xs text-slate-300 w-5 text-right pt-1 flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{co.name}</h3>
                      {co.score !== null && (
                        <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{co.score}/10</span>
                      )}
                      {co.stage && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{co.stage}</span>}
                    </div>
                    {co.description && <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{co.description}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 mt-2">
                      {co.geography && <span>&#128205; {co.geography}</span>}
                      {co.website && <a href={co.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">&#127760; Website</a>}
                      {co.linkedin && <a href={co.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">LinkedIn</a>}
                    </div>
                    {co.notes && <p className="text-xs text-slate-400 mt-1.5 italic">{co.notes}</p>}
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