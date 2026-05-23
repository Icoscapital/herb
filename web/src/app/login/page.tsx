'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleMicrosoftLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email profile openid',
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error
    } catch (error) {
      console.error('Login error:', error)
      alert('Login failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-900">🌿 Herb</h1>
            <p className="text-slate-600 mt-2">Icos Capital Sourcing Agent</p>
            <p className="text-sm text-slate-500 mt-1">AI-powered startup discovery</p>
          </div>

          <button
            onClick={handleMicrosoftLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition-colors duration-200"
          >
            {loading ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>

          <p className="text-center text-xs text-slate-500 mt-6">
            You'll be signed in with your icoscapital.com account
          </p>
        </div>

        <div className="mt-8 text-center text-sm text-slate-600">
          <p>Submit a mandate → Herb searches globally</p>
          <p className="mt-1">→ Get results via dashboard</p>
        </div>
      </div>
    </div>
  )
}
