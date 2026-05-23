'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Icos Capital logo at top */}
      <div className="mb-8 flex flex-col items-center">
        <svg width="220" height="56" viewBox="0 0 220 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Icos Capital">
          {/* "IC" monogram circle */}
          <circle cx="28" cy="28" r="27" fill="#0f172a" />
          <text x="28" y="35" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="Georgia, serif" letterSpacing="1">IC</text>
          {/* Wordmark */}
          <text x="64" y="24" fill="#0f172a" fontSize="18" fontWeight="700" fontFamily="Georgia, serif" letterSpacing="0.5">ICOS</text>
          <text x="64" y="42" fill="#64748b" fontSize="11" fontWeight="400" fontFamily="Georgia, serif" letterSpacing="3">CAPITAL</text>
        </svg>
      </div>

      <div className="w-full max-w-md px-4">
        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🌿</div>
            <h1 className="text-2xl font-bold text-slate-900">Herb</h1>
            <p className="text-slate-500 text-sm mt-1">AI-powered startup sourcing</p>
          </div>

          <button
            onClick={handleMicrosoftLogin}
            disabled={loading}
            className="w-full bg-[#0078d4] hover:bg-[#106ebe] disabled:bg-slate-300 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-3 text-sm"
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                Signing in…
              </>
            ) : (
              <>
                {/* Microsoft logo */}
                <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          <p className="text-center text-xs text-slate-400 mt-5">
            Sign in with your <strong>@icoscapital.com</strong> account
          </p>
        </div>

        {/* Confidentiality warning */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 text-sm mt-0.5">⚠</span>
            <div>
              <p className="font-semibold mb-1">Restricted Access — Vertrouwelijkheid</p>
              <p className="leading-relaxed">
                This system is for <strong>Icos Capital employees only</strong>. Unauthorized access or use is strictly prohibited and constitutes a criminal offence under Dutch law (<em>Artikel 138ab Wetboek van Strafrecht</em> — computervredebreuk), punishable by up to two years imprisonment. All access attempts are logged. If you are not an Icos Capital employee, disconnect immediately.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Submit a mandate → Herb searches globally → Results to your inbox
        </p>
      </div>
    </div>
  )
}
