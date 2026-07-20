/**
 * Generate a herb_runs.slug for a freshly-submitted mandate.
 *
 * Format: {date}-{theme-slice}-{rand}
 *   - date:  YYYY-MM-DD (for human sorting/scanning)
 *   - theme: first 30 chars of the slugified theme (human-readable identifier)
 *   - rand:  6-char random suffix — GUARANTEES uniqueness even when two
 *            different themes share the same first 30 characters on the
 *            same day (common: many mandates start "Find start-ups
 *            which are producing…" or "Find companies which…", and a bare
 *            date+theme-prefix slug collided in production — herb_runs_slug_key
 *            unique-constraint violation on submit).
 *
 * The random suffix sits BEFORE any later "-rN" round suffix (appended
 * separately by /api/feedback and scripts/watch_tick.py via `${base}-r${n}`),
 * so round-lineage stripping (`slug.replace(/-r\d+$/, '')`) still works
 * unchanged — the round suffix regex only strips a trailing "-r<digits>",
 * which this function never produces.
 */
export function generateRunSlug(theme: string): string {
  const date = new Date().toISOString().split('T')[0]
  const themeSlice = theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${date}-${themeSlice}-${rand}`
}
