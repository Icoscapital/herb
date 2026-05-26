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


def get_mandate_by_id(run_id: str) -> list:
    """Fetch a specific run by ID regardless of status — used by web-triggered runs.

    The web Run button flips status to SEARCHING immediately (for UI), so the
    PENDING query won't match. This helper fetches the row by id directly.
    Returns a list (possibly empty) for symmetry with get_pending_mandates().
    """
    sb = _get_sb()
    result = (
        sb.table("herb_runs")
        .select(
            "id,theme,geography,stage,search_mode,special_instructions,"
            "submitted_by_email,submitted_by_name,attachments,created_at,slug,status"
        )
        .eq("id", run_id)
        .limit(1)
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
    Replace all herb_longlist rows for this run with the new results.

    Deletes any existing rows first so re-runs don't produce duplicates.
    Each company dict should contain (all optional except name):
      name, description, website, linkedin, stage, geography,
      score (float 0-10), source, notes
    """
    sb = _get_sb()
    # Clear any results from a previous attempt (idempotent re-runs)
    sb.table("herb_longlist").delete().eq("run_id", run_id).execute()
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
        sb.table("herb_longlist").insert(rows).execute()


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


def load_attachments(run_id: str) -> tuple[list[dict], list[dict]]:
    """Download and parse all herb_files attachments for a run.

    Returns (additional_companies, extra_check_sites) ready to merge into
    a Phase 2 search:
        additional_companies: list of {name, domain, source} extracted from
            PitchBook exports and company lists (CSV or xlsx).
        extra_check_sites:    list of {name, url} extracted from check-sites
            files — used as additional VC portfolios to scrape in Phase 2.

    Errors on individual files are logged and skipped (non-fatal).
    """
    import requests, csv, io
    files = get_run_files(run_id)
    additional_companies: list[dict] = []
    extra_check_sites: list[dict] = []

    def _download(url: str) -> bytes:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        return r.content

    def _parse_xlsx_rows(raw: bytes):
        import openpyxl, tempfile, os as _os
        with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
            tmp.write(raw); tmp_path = tmp.name
        try:
            wb = openpyxl.load_workbook(tmp_path, read_only=True, data_only=True)
            ws = wb.active
            headers = [str(c.value or '').lower() for c in next(ws.iter_rows(min_row=1, max_row=1))]
            for row in ws.iter_rows(min_row=2, values_only=True):
                yield headers, row
            wb.close()
        finally:
            _os.unlink(tmp_path)

    for f in files:
        slot = f.get('slot_type')
        try:
            raw = _download(f['url'])
            is_csv = f['name'].lower().endswith('.csv')

            if slot in ('pitchbook', 'company-list'):
                if is_csv:
                    reader = csv.DictReader(io.StringIO(raw.decode('utf-8', errors='replace')))
                    for row in reader:
                        name = row.get('Company') or row.get('Name') or row.get('company') or ''
                        domain = row.get('Domain') or row.get('Website') or row.get('website') or ''
                        if name.strip():
                            additional_companies.append({'name': name.strip(), 'domain': domain.strip(), 'source': f['name']})
                else:
                    for headers, row in _parse_xlsx_rows(raw):
                        name_col = next((i for i, h in enumerate(headers) if 'company' in h or 'name' in h), 0)
                        domain_col = next((i for i, h in enumerate(headers) if 'domain' in h or 'website' in h or 'url' in h), None)
                        name = str(row[name_col] or '').strip()
                        domain = str(row[domain_col] or '').strip() if domain_col is not None else ''
                        if name:
                            additional_companies.append({'name': name, 'domain': domain, 'source': f['name']})

            elif slot == 'check-sites':
                if is_csv:
                    reader = csv.DictReader(io.StringIO(raw.decode('utf-8', errors='replace')))
                    for row in reader:
                        site_name = row.get('name') or row.get('Name') or row.get('VC') or ''
                        site_url = row.get('url') or row.get('URL') or row.get('website') or ''
                        if site_url.strip():
                            extra_check_sites.append({'name': site_name.strip(), 'url': site_url.strip()})
                else:
                    for headers, row in _parse_xlsx_rows(raw):
                        name_col = next((i for i, h in enumerate(headers) if 'name' in h or 'vc' in h), 0)
                        url_col = next((i for i, h in enumerate(headers) if 'url' in h or 'website' in h), None)
                        site_name = str(row[name_col] or '').strip()
                        site_url = str(row[url_col] or '').strip() if url_col is not None else ''
                        if site_url:
                            extra_check_sites.append({'name': site_name, 'url': site_url})
        except Exception as e:
            print(f"[load_attachments] could not parse {f.get('name')}: {e}")

    return additional_companies, extra_check_sites
