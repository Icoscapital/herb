"""
Herb Web Mandate Utilities
Handles all Supabase I/O for web-submitted mandates.

Used by routine_prompt.md STEP 1B to:
  - Fetch PENDING runs from herb_runs
  - Track status transitions (PENDING → SEARCHING → DONE/EMAILED/ERROR)
  - Store per-company results into herb_longlist
  - Record result_count, duration_seconds, error_message on the run row
"""
import os
from datetime import datetime, timezone
from supabase import create_client, Client


def _get_sb() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


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
    """Transition run to SEARCHING so the dashboard shows the live indicator."""
    _get_sb().table("herb_runs").update({"status": "SEARCHING"}).eq("id", run_id).execute()


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
            "score": c.get("score"),        # nullable float
            "source": c.get("source") or "",
            "notes": c.get("notes") or "",
        }
        for c in companies
        if c.get("name")                    # skip blank-name rows
    ]
    if rows:
        _get_sb().table("herb_longlist").insert(rows).execute()


def mark_done(run_id: str, result_count: int, duration_seconds: int) -> None:
    """Set run status to DONE after results are stored."""
    _get_sb().table("herb_runs").update(
        {
            "status": "DONE",
            "result_count": result_count,
            "duration_seconds": duration_seconds,
        }
    ).eq("id", run_id).execute()


def mark_emailed(run_id: str) -> None:
    """Upgrade status to EMAILED once the notification email is sent."""
    _get_sb().table("herb_runs").update({"status": "EMAILED"}).eq("id", run_id).execute()


def mark_error(run_id: str, message: str) -> None:
    """Record an error and set status to ERROR."""
    _get_sb().table("herb_runs").update(
        {
            "status": "ERROR",
            "error_message": str(message)[:500],
        }
    ).eq("id", run_id).execute()
