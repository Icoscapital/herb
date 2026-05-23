'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      setLoading(false)
    }
    getUser()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loading-spinner"></div></div>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-900">🌿 Herb</h1>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-3xl font-bold mb-4">Welcome, {user?.email}!</h2>
          <p className="text-slate-600 mb-8">
            Dashboard coming soon. You're successfully authenticated with Azure SSO! ✅
          </p>
          <p className="text-slate-500 text-sm">
            This is a placeholder. Full features (mandate submission, search, results) will be available soon.
          </p>
        </div>
      </div>
    </div>
  )
}
