"""
Herb Web Mandate Utilities
Handles all Supabase I/O for web-submitted mandates.

Used by routine_prompt.md STEP 1B to:
  - Fetch PENDING runs from herb_runs
  - Track status transitions (PENDING → SEARCHING → DONE/EMAILED/ERROR)
  - Report live progress at every step (progress + last_heartbeat columns)
  - Store per-company results into herb_longlist
  - Record result_count, duration_seconds, error_message on the run row
"""
import os
from datetime import datetime, timezone
from supabase import create_client, Client

# Credentials — env vars take precedence, hardcoded fallbacks ensure CCR works
# even when shell exports don't propagate to Python subprocesses.
_SB_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
           or "https://lwgypkokjqerkgcpqhnt.supabase.co")
_SB_KEY = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
           or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3Z3lwa29ranFlcmtnY3BxaG50Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU0NzkyNywiZXhwIjoyMDk1MTIzOTI3fQ.y9aBM8wYfoG4b_sd9-DQ7vioG0m_SNeeTIOMHU1v_co")


def _get_sb() -> Client:
    return create_client(_SB_URL, _SB_KEY)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_pending_mandates() -> list:
    """Return all runs with status=PENDING, oldest first."""
    sb = _get_sb()
    result = (
        sb.table("herb_runs")
        .select(
            "id,theme,geography,stage,search_mode,special_instructions,"
            "submitted_by_email,submitted_by_name,attachments,created_at,slug"
        )
        .eq("status", "PENDING")
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []


def mark_searching(run_id: str) -> None:
    """Transition run to SEARCHING and set initial progress."""
    _get_sb().table("herb_runs").update({
        "status": "SEARCHING",
        "progress": "Starting up…",
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def update_progress(run_id: str, message: str) -> None:
    """
    Write a progress message + refresh heartbeat timestamp.
    Call this at every major step so the dashboard shows live status
    and stall detection can fire if heartbeat goes stale.

    Examples:
        update_progress(id, "Setting up environment")
        update_progress(id, "Searching source 3/10: PitchBook")
        update_progress(id, "Deduplicating 187 rows")
        update_progress(id, "Pipedrive cross-check (batch 4/8)")
        update_progress(id, "Storing 63 companies to database")
    """
    print(f"[HERB] {message}")   # also visible in CCR session logs
    _get_sb().table("herb_runs").update({
        "progress": message[:300],
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def store_results(run_id: str, companies: list) -> None:
    """
    Bulk-insert company rows into herb_longlist.

    Each company dict should contain (all optional except name):
      name, description, website, linkedin, stage, geography,
      score (float 0-10), source, notes
    """
    if not companies:
        return
    rows = [
        {
            "run_id": run_id,
            "name": c.get("name", ""),
            "description": c.get("description") or "",
            "website": c.get("website") or "",
            "linkedin": c.get("linkedin") or "",
            "stage": c.get("stage") or "",
            "geography": c.get("geography") or "",
            "score": c.get("score"),
            "source": c.get("source") or "",
            "notes": c.get("notes") or "",
        }
        for c in companies
        if c.get("name")
    ]
    if rows:
        _get_sb().table("herb_longlist").insert(rows).execute()


def mark_done(run_id: str, result_count: int, duration_seconds: int) -> None:
    """Set run status to DONE after results are stored."""
    _get_sb().table("herb_runs").update({
        "status": "DONE",
        "result_count": result_count,
        "duration_seconds": duration_seconds,
        "progress": f"Complete — {result_count} companies found",
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def mark_emailed(run_id: str) -> None:
    """Upgrade status to EMAILED once the notification email is sent."""
    _get_sb().table("herb_runs").update({
        "status": "EMAILED",
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def mark_error(run_id: str, message: str) -> None:
    """Record an error and set status to ERROR."""
    _get_sb().table("herb_runs").update({
        "status": "ERROR",
        "error_message": str(message)[:500],
        "progress": f"Failed: {str(message)[:200]}",
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def get_run_files(run_id: str) -> list:
    """
    Return all files linked to a run PLUS global check-sites for the run's user.

    Each item in the returned list is a dict:
      {
        "id": str,
        "user_id": str,
        "run_id": str | None,
        "slot_type": str,   # 'pitchbook' | 'company-list' | 'check-sites'
        "name": str,
        "url": str,
        "path": str,
        "size": int | None,
        "is_global": bool,
      }

    Usage in routine_prompt.md STEP 1B:
        from scripts.herb_web_run import get_run_files
        files = get_run_files(m['id'])
        pitchbook_files  = [f for f in files if f['slot_type'] == 'pitchbook']
        company_lists    = [f for f in files if f['slot_type'] == 'company-list']
        check_site_files = [f for f in files if f['slot_type'] == 'check-sites']
    """
    sb = _get_sb()

    # Get all files linked to this specific run
    run_result = (
        sb.table("herb_files")
        .select("*")
        .eq("run_id", run_id)
        .execute()
    )
    run_files = run_result.data or []

    # Derive user_id from the run
    user_id: str | None = None
    if run_files:
        user_id = run_files[0].get("user_id")
    else:
        # Look up the run to get user_id
        run_row = (
            sb.table("herb_runs")
            .select("user_id")
            .eq("id", run_id)
            .maybe_single()
            .execute()
        )
        if run_row.data:
            user_id = run_row.data.get("user_id")

    # Get global check-sites for this user (not already in run_files)
    global_files: list = []
    if user_id:
        global_result = (
            sb.table("herb_files")
            .select("*")
            .eq("is_global", True)
            .eq("user_id", user_id)
            .execute()
        )
        run_paths = {f["path"] for f in run_files}
        global_files = [
            f for f in (global_result.data or [])
            if f["path"] not in run_paths
        ]

    return run_files + global_files
