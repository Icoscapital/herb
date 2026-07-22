'use client'

export interface SearchPlan {
  ok: boolean
  mode: 'COMPREHENSIVE' | 'EU_ONLY'
  regions: string[]
  stage: string
  must_haves: string[]
  exclusions: string[]
  query_terms: string[]
  sources_summary: string
  icos_fit: boolean
  include_small: boolean
  exhaustive: boolean
  seed_companies: string | null
}

interface Props {
  open: boolean
  loading: boolean
  error: string | null
  plan: SearchPlan | null
  confirming: boolean
  onConfirm: () => void
  onEdit: () => void
  onRunWithoutPreview: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</span>
      <div className="text-sm" style={{ color: 'var(--text)' }}>{children}</div>
    </div>
  )
}

function ChipList({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'warn' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="text-xs px-2.5 py-1 rounded-full"
          style={{
            background: tone === 'warn' ? '#fdf2f1' : 'var(--bg)',
            border: `1px solid ${tone === 'warn' ? '#e74c3c' : 'var(--border)'}`,
            color: tone === 'warn' ? '#c0392b' : 'var(--muted)',
          }}>
          {item}
        </span>
      ))}
    </div>
  )
}

export default function SearchPlanDialog({
  open, loading, error, plan, confirming, onConfirm, onEdit, onRunWithoutPreview,
}: Props) {
  if (!open) return null

  return (
    <>
      <div onClick={onEdit} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 950 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(560px, 92vw)', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--surface)', borderRadius: 20, zIndex: 951,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <span className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            Here's what Herb will search for
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <span className="loading-spinner" style={{ width: 20, height: 20 }} />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>Reading your request…</span>
            </div>
          )}

          {error && !loading && (
            <div style={{ background: '#fdf2f1', border: '1px solid #e74c3c', borderRadius: 10, padding: '12px 14px' }}>
              <p className="text-sm" style={{ color: '#c0392b', marginBottom: 8 }}>
                Could not generate a preview: {error}
              </p>
              <button onClick={onRunWithoutPreview}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: 'transparent', border: '1px solid #c0392b', color: '#c0392b' }}>
                Skip preview — run search anyway
              </button>
            </div>
          )}

          {plan && !loading && !error && (
            <>
              <Row label="Scope">
                {plan.mode === 'EU_ONLY' ? '🇪🇺 European VCs only' : '🌍 Comprehensive'} · Regions: {plan.regions.join(', ')} · Stage: {plan.stage}
              </Row>

              <Row label="Keywords Herb will search">
                {plan.query_terms.length > 0
                  ? <ChipList items={plan.query_terms} />
                  : <span style={{ color: 'var(--subtle)' }}>No specific terms extracted — will search the general topic.</span>}
              </Row>

              <Row label={`Must-have requirements${plan.must_haves.length ? ` (${plan.must_haves.length})` : ''}`}>
                {plan.must_haves.length > 0
                  ? <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {plan.must_haves.map((m, i) => <li key={i} style={{ marginBottom: 3 }}>{m}</li>)}
                    </ul>
                  : <span style={{ color: 'var(--subtle)' }}>None detected — this reads as a general topic search.</span>}
              </Row>

              {plan.exclusions.length > 0 && (
                <Row label="Exclusions">
                  <ChipList items={plan.exclusions} tone="warn" />
                </Row>
              )}

              <Row label="Sources">
                <span style={{ color: 'var(--muted)' }}>{plan.sources_summary}</span>
              </Row>

              {(plan.icos_fit || plan.include_small || plan.exhaustive) && (
                <Row label="Options">
                  <div className="flex flex-wrap gap-1.5">
                    {plan.icos_fit && <ChipList items={['Icos Fit scoring enabled']} />}
                    {plan.include_small && <ChipList items={['Includes sub-10-FTE companies']} />}
                  </div>
                </Row>
              )}

              {plan.exhaustive && (
                <div style={{ background: '#fdf6ec', border: '1.5px solid #b7600a', borderRadius: 10, padding: '10px 14px' }}>
                  <strong style={{ color: '#b7600a' }}>COMPREHENSIVE &amp; EXPENSIVE SEARCH</strong>
                  <span className="text-sm" style={{ color: 'var(--muted)', display: 'block', marginTop: 2 }}>
                    Every matching fund gets queried — a multi-hour run at roughly 5–10× normal cost.
                  </span>
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                If this looks wrong, click Edit and adjust your request — Confirm starts the search immediately.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)',
          }}>
            <button onClick={onEdit} disabled={confirming}
              className="text-sm font-medium px-4 py-2 rounded-xl"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              ✎ Edit
            </button>
            {plan && !error && (
              <button onClick={onConfirm} disabled={confirming}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl"
                style={{ background: 'var(--teal)', color: '#fff', cursor: confirming ? 'default' : 'pointer' }}>
                {confirming
                  ? <><span className="loading-spinner" style={{ width: 13, height: 13, borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.3)' }} /> Starting…</>
                  : '✓ Confirm — run search now'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
