'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email profile openid',
          redirectTo: `${window.location.origin}/dashboard`,
        },
      })
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Top bar */}
      <header className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">&#127807;</span>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text)' }}>Herb</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
            Icos Capital
          </span>
        </div>
      </header>

      {/* Center */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Logo / brand */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-5"
              style={{ background: 'var(--accent)', color: '#fff', fontSize: '22px' }}>
              &#127807;
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1.5" style={{ color: 'var(--text)' }}>
              Welcome to Herb
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              AI-powered startup sourcing for Icos Capital
            </p>
          </div>

          {/* Sign-in card */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium transition-all"
              style={{
                background: loading ? 'var(--border)' : '#0078d4',
                color: loading ? 'var(--muted)' : '#fff',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <><div className="loading-spinner" style={{ borderColor: '#ccc', borderTopColor: '#888' }} /> Signing in…</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  Continue with Microsoft
                </>
              )}
            </button>
            <p className="text-center text-xs mt-4" style={{ color: 'var(--subtle)' }}>
              Sign in with your <strong>@icoscapital.com</strong> account
            </p>
          </div>

          {/* Legal warning */}
          <div className="mt-5 rounded-xl p-4 text-xs leading-relaxed"
            style={{ background: '#fefce8', border: '1px solid #fde68a', color: '#854d0e' }}>
            <p className="font-semibold mb-1">Restricted access &mdash; Vertrouwelijkheid</p>
            <p>
              This system is for <strong>Icos Capital employees only</strong>.
              Unauthorised access constitutes a criminal offence under Dutch law
              (<em>Artikel 138ab Wetboek van Strafrecht</em> &mdash; computervredebreuk),
              punishable by up to two years imprisonment. All access is logged.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
