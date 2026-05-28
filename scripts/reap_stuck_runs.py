"""Flip stuck SEARCHING runs to ERROR.

If a run has status=SEARCHING but its last_heartbeat is older than
STALE_THRESHOLD_MINUTES, the GitHub Actions job that was supposed to be
driving it has almost certainly died (workflow crash, timeout, OOM,
ANTHROPIC_API_KEY revoked, etc). Without this reaper the row sits
SEARCHING forever — the dashboard shows a spinner that never resolves and
the user can't re-trigger because the Run button only appears for PENDING
or ERROR.

Run hourly from herb-schedule.yml. Idempotent.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

# Stale threshold — a healthy run touches last_heartbeat every few seconds via
# update_progress(). 15 minutes is well past any legitimate stall.
STALE_THRESHOLD_MINUTES = 15


def main() -> int:
    sb_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SB_URL")
    sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SB_KEY")
    if not sb_url or not sb_key:
        sys.stderr.write("ERROR: Supabase credentials missing.\n")
        return 1

    # Lazy import so the script can be smoke-tested without supabase installed
    from supabase import create_client

    sb = create_client(sb_url, sb_key)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_THRESHOLD_MINUTES)
    cutoff_iso = cutoff.isoformat()

    # Find SEARCHING rows with stale heartbeat (or no heartbeat at all)
    result = (
        sb.table("herb_runs")
        .select("id, theme, last_heartbeat, progress")
        .eq("status", "SEARCHING")
        .lt("last_heartbeat", cutoff_iso)
        .execute()
    )
    stuck = result.data or []

    if not stuck:
        print(f"[reaper] no stuck runs (cutoff: {cutoff_iso})")
        return 0

    print(f"[reaper] found {len(stuck)} stuck SEARCHING runs (cutoff: {cutoff_iso})")
    for r in stuck:
        last_hb = r.get("last_heartbeat") or "never"
        msg = (
            f"Worker died — no heartbeat since {last_hb}. "
            f"Last progress: {r.get('progress') or 'unknown'}. "
            f"Re-trigger the run from the dashboard."
        )
        sb.table("herb_runs").update({
            "status": "ERROR",
            "error_message": msg[:500],
            "progress": "Failed: worker stopped responding",
            "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        }).eq("id", r["id"]).eq("status", "SEARCHING").execute()
        print(f"[reaper] reaped {r['id']} — {r.get('theme', '')[:60]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
