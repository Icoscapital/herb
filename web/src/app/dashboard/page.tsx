'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Run = {
  id: string; slug: string; theme: string; status: string
  geography: string; stage: string; search_mode: string
  created_at: string; keywords: string | null
}

const STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  SEARCHING: { label: 'Searching...', pill: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-400 animate-pulse' },
  DONE:      { label: 'Complete',     pill: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  EMAILED:   { label: 'Results sent', pill: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500' },
  ERROR:     { label: 'Error',        pill: 'bg-red-100 text-red-700',      dot: 'bg-red-500' },
  PENDING:   { label: 'Pending',      pill: 'bg-yellow-100 text-yellow-700',dot: 'bg-yellow-400' },
}

function Card({ run, s, date, done }: { run: Run; s: any; date: string; done: boolean }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4 ${done ? 'hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">{run.theme}</p>
        <p className="text-xs text-slate-400 mt-0.5">{run.geography} &middot; {run.stage} &middot; {date}</p>
      </div>
      <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.pill}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        {s.label}
      </span>
      {done && <span className="text-slate-300 flex-shrink-0">&#8594;</span>}
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const router = useRouter()

  const loadRuns = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('herb_runs')
      .select('id,slug,theme,status,geography,stage,search_mode,created_at,keywords')
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
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="loading-spinner" />
    </div>
  )

  const name = user?.user_metadata?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there'

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-semibold text-slate-800">&#127807; Herb</span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-400 hidden sm:block">{user?.email}</span>
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
              className="text-xs text-slate-400 hover:text-slate-600"
            >Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-slate-800">Hi {name}</h1>
          <Link
            href="/dashboard/new"
            className="bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            + New search
          </Link>
        </div>

        {runs.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-4">&#127793;</p>
            <p className="text-slate-500 mb-6">No searches yet. Tell Herb what you are looking for.</p>
            <Link href="/dashboard/new" className="bg-slate-900 text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-slate-700 transition-colors">
              Start first search
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(run => {
              const s = STATUS[run.status] ?? STATUS.PENDING
              const date = new Date(run.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              const done = ['DONE', 'EMAILED'].includes(run.status)
              return done ? (
                <Link key={run.id} href={`/dashboard/mandates/${run.id}`}>
                  <Card run={run} s={s} date={date} done />
                </Link>
              ) : (
                <Card key={run.id} run={run} s={s} date={date} done={false} />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
