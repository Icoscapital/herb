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
import re
from datetime import datetime, timezone
from supabase import create_client, Client

# Credentials MUST come from env vars. No fallbacks — service-role keys
# must never live in source. GitHub Actions exports these from repo secrets.
_SB_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SB_URL")
_SB_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SB_KEY")


def _get_sb() -> Client:
    if not _SB_URL or not _SB_KEY:
        raise RuntimeError(
            "Supabase credentials missing — set NEXT_PUBLIC_SUPABASE_URL "
            "and SUPABASE_SERVICE_ROLE_KEY in the environment."
        )
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
    # select("*") so optional v2 columns (icos_fit, seed_companies, watch)
    # flow through when present without breaking pre-migration databases.
    result = (
        sb.table("herb_runs")
        .select("*")
        .eq("id", run_id)
        .limit(1)
        .execute()
    )
    return result.data or []


def mark_searching(run_id: str) -> None:
    """Transition run to SEARCHING and set initial progress.

    Clears any error_message from a prior failed attempt — otherwise a re-run
    that succeeds would still show the old error on the dashboard.
    """
    _get_sb().table("herb_runs").update({
        "status": "SEARCHING",
        "progress": "Starting up…",
        "error_message": None,
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


def save_search_plan(run_id: str, plan_text: str) -> None:
    """
    Persist Herb's interpreted search plan (must-haves, keywords, sources,
    regions — from STEP 2.0) so the dashboard can show it within the first
    ~30-60s of a run, well before results are ready. Lets the author catch
    a misread mandate early instead of finding out at completion.

    Non-fatal: the search_plan column may not exist pre-migration.
    """
    print(f"[HERB] search plan:\n{plan_text}")
    try:
        _get_sb().table("herb_runs").update({
            "search_plan": plan_text[:2000],
            "last_heartbeat": _now(),
        }).eq("id", run_id).execute()
    except Exception as e:
        print(f"[HERB] save_search_plan skipped (non-fatal): {e}")


def store_results(run_id: str, companies: list) -> None:
    """
    Replace all herb_longlist rows for this run with the new results.

    Ordered so the dashboard never sees a zero-row gap during a re-run:
      1. Snapshot the IDs of existing rows for this run
      2. Insert the new rows (now the dashboard sees old + new briefly)
      3. Delete the snapshotted old rows (dashboard now sees only new)

    The brief duplicate window is a small cosmetic issue (rows ordered by
    score so duplicates appear interleaved); the alternative — a moment of
    zero rows after a DELETE before an INSERT — caused the dashboard to
    flash "Results not yet available" mid-rerun.

    Each company dict should contain (all optional except name):
      name, description, website, linkedin, stage, geography,
      score (float 0-10), source, notes
    """
    sb = _get_sb()

    _PLACEHOLDERS = ("", "unknown", "n/a", "na", "n.a.", "-", "—", "none", "tbd", "?")

    def _clean(val: str | None) -> str:
        """Return empty string for None, 'Unknown', 'N/A', '-' placeholders."""
        if not val:
            return ""
        s = str(val).strip()
        return "" if s.lower() in _PLACEHOLDERS else s

    def _clean_url(val: str | None) -> str:
        """
        Normalize a website/LinkedIn value to a single clean domain or "".

        Agents frequently emit messy values that the old _clean let through and
        the frontend then silently dropped, leaving a blank link:
          "planetary.bio (also planetarygroup.ch, planetary.ag)" -> "planetary.bio"
          "Unknown (arsenalebioyards.com likely)"                -> ""  (guessed -> don't link a maybe)
          "acme.com, www.acme.io"                                -> "acme.com"
          "https://acme.com/about"                               -> "https://acme.com/about"
        Take the text before any parenthetical aside, then the first candidate
        token. A bare placeholder before the paren means the real value was only
        a guess — we return "" rather than link to an unverified domain.
        """
        if not val:
            return ""
        head = str(val).split("(")[0].strip().rstrip(",;/ ")
        if head.lower() in _PLACEHOLDERS:
            return ""
        token = head.replace(",", " ").split()[0].strip().strip("<>\"'")
        if token.lower().startswith(("http://", "https://")):
            return token
        # bare domain: must contain a dot, a valid TLD-ish tail, and no spaces
        if "." in token and " " not in token and re.match(r"^[a-z0-9.\-/_:]+\.[a-z]{2,}", token, re.I):
            return token
        return ""

    # Include optional v2/v3 columns only when at least one company carries a
    # value (pre-migration databases lack them). PostgREST bulk inserts need
    # uniform keys, so each column is all rows or none.
    any_deep_dive = any(c.get("deep_dive") for c in companies)
    any_segment = any(c.get("segment") for c in companies)
    rows = [
        {
            "run_id": run_id,
            "name": c.get("name", ""),
            "description": _clean(c.get("description")),
            "website": _clean_url(c.get("website")),
            "linkedin": _clean_url(c.get("linkedin")),
            "stage": _clean(c.get("stage")),
            "geography": _clean(c.get("geography")),
            "score": c.get("score"),
            "source": _clean(c.get("source")),
            "notes": _clean(c.get("notes")),
            **({"deep_dive": _clean(c.get("deep_dive"))} if any_deep_dive else {}),
            **({"segment": _clean(c.get("segment"))} if any_segment else {}),
        }
        for c in companies
        if c.get("name")
    ]

    # 1. Snapshot existing row IDs (so we delete *only* what existed before)
    existing = sb.table("herb_longlist").select("id").eq("run_id", run_id).execute()
    existing_ids = [r["id"] for r in (existing.data or [])]

    # 2. Insert the new rows first — dashboard never sees a zero-row gap
    if rows:
        sb.table("herb_longlist").insert(rows).execute()

    # 3. Now delete the previously-existing rows (if any)
    if existing_ids:
        sb.table("herb_longlist").delete().in_("id", existing_ids).execute()


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


def _norm_hdr(v) -> str:
    return str(v).strip().lower() if v is not None else ""


# Exact header labels that name the company column (checked before substring rules).
_NAME_EXACT = ("companies", "company name", "company", "organization name",
               "organisation name", "organization", "organisation", "name")


def find_header_row(rows: list) -> int:
    """Index of the real header row. PitchBook exports carry ~7 title/metadata
    rows before the column headers, so row 0 is not the header. The header is the
    first row (within the first 25) containing an exact name label like
    'Companies' or 'Company Name'. Falls back to 0 if none found."""
    for i, row in enumerate(rows[:25]):
        cells = {_norm_hdr(c) for c in row}
        if cells & set(_NAME_EXACT):
            return i
    return 0


def find_name_col(headers: list[str]) -> int:
    """Company-name column. Must beat the 'Company ID' decoy: prefer an exact
    name label, then a header containing 'compan'/'name' but NOT 'id', else 0."""
    norm = [_norm_hdr(h) for h in headers]
    for want in _NAME_EXACT:
        if want in norm:
            return norm.index(want)
    for i, h in enumerate(norm):
        if ("compan" in h or "name" in h) and "id" not in h:
            return i
    return 0


def find_domain_col(headers: list[str]):
    """Company website column — the company's OWN site, not investor websites or
    Majestic SEO 'referring domains'. Prefer exact 'website'/'domain'."""
    norm = [_norm_hdr(h) for h in headers]
    for want in ("website", "domain", "url"):
        if want in norm:
            return norm.index(want)
    bad = ("investor", "referring", "majestic", "linkedin", "view", "former")
    for i, h in enumerate(norm):
        if any(k in h for k in ("website", "domain")) and not any(b in h for b in bad):
            return i
    for i, h in enumerate(norm):
        if "url" in h and not any(b in h for b in bad):
            return i
    return None


def find_linkedin_col(headers: list[str]):
    norm = [_norm_hdr(h) for h in headers]
    for i, h in enumerate(norm):
        if "linkedin" in h:
            return i
    return None


def find_siteurl_col(headers: list[str]):
    """URL column for a check-sites file (portfolio/source URLs)."""
    norm = [_norm_hdr(h) for h in headers]
    for want in ("url", "website", "link", "portfolio"):
        if want in norm:
            return norm.index(want)
    for i, h in enumerate(norm):
        if any(k in h for k in ("url", "website", "link")):
            return i
    return None


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

    def _read_rows(raw: bytes, is_csv: bool) -> list:
        """Return all rows as lists of cell values, regardless of format."""
        if is_csv:
            text = raw.decode('utf-8-sig', errors='replace')
            return [row for row in csv.reader(io.StringIO(text))]
        import openpyxl, tempfile, os as _os
        with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as tmp:
            tmp.write(raw); tmp_path = tmp.name
        try:
            wb = openpyxl.load_workbook(tmp_path, read_only=True, data_only=True)
            ws = wb.active
            rows = [list(r) for r in ws.iter_rows(values_only=True)]
            wb.close()
            return rows
        finally:
            _os.unlink(tmp_path)

    for f in files:
        slot = f.get('slot_type')
        try:
            raw = _download(f['url'])
            is_csv = f['name'].lower().endswith('.csv')
            rows = _read_rows(raw, is_csv)
            if not rows:
                print(f"[load_attachments] {f.get('name')}: no rows"); continue

            # PitchBook exports carry ~7 title/metadata rows before the header —
            # find the real header row rather than assuming row 0.
            h_idx = find_header_row(rows)
            headers = [str(c) if c is not None else '' for c in rows[h_idx]]
            data = rows[h_idx + 1:]

            def _cell(row, col):
                return str(row[col]).strip() if col is not None and col < len(row) and row[col] is not None else ''

            if slot in ('pitchbook', 'company-list'):
                name_col = find_name_col(headers)
                domain_col = find_domain_col(headers)
                li_col = find_linkedin_col(headers)
                kept = 0
                for row in data:
                    name = _cell(row, name_col)
                    # Skip stray footer/blank rows and any leaked ID-only value.
                    if not name or name.lower() in ('', 'nan', 'none'):
                        continue
                    rec = {'name': name, 'domain': _cell(row, domain_col), 'source': f['name']}
                    li = _cell(row, li_col)
                    if li:
                        rec['linkedin'] = li
                    additional_companies.append(rec)
                    kept += 1
                print(f"[load_attachments] {f['name']}: header row {h_idx + 1}, "
                      f"name col '{headers[name_col] if name_col < len(headers) else '?'}', "
                      f"{kept} companies")

            elif slot == 'check-sites':
                name_col = find_name_col(headers)
                url_col = find_siteurl_col(headers)
                for row in data:
                    site_url = _cell(row, url_col)
                    if site_url:
                        extra_check_sites.append({'name': _cell(row, name_col), 'url': site_url})
        except Exception as e:
            print(f"[load_attachments] could not parse {f.get('name')}: {e}")

    return additional_companies, extra_check_sites
