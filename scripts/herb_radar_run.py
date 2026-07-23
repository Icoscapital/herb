"""
Update Radar helpers — Supabase I/O for herb_radar_runs / herb_radar_findings.

Used by update_radar_prompt.md:

    from scripts.herb_radar_run import start_radar_run, finish_radar_run, fail_radar_run
    ctx = start_radar_run()            # {run_id, companies: [{watch_id, pipedrive_deal_id, company_name, domain, stage_id, description}]}
    ...                                 # Claude dispatches per-company research sub-agents
    finish_radar_run(ctx, findings)    # writes qualifying findings, marks DONE
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from .herb_web_run import _get_sb

_UPDATE_TYPES = {"FUNDING", "COMPETITOR_FUNDING", "COMMERCIAL", "NEWS"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def update_progress(run_id: str, message: str) -> None:
    """Write a progress message + refresh heartbeat, same idiom as herb_web_run.update_progress
    but scoped to herb_radar_runs."""
    print(f"[RADAR] {message}")
    _get_sb().table("herb_radar_runs").update({
        "progress": message[:300],
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()


def start_radar_run() -> dict:
    run_id = os.environ.get("RADAR_RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("[radar-run] RADAR_RUN_ID env var is empty")
    sb = _get_sb()
    run = sb.table("herb_radar_runs").select("*").eq("id", run_id).single().execute()
    if not run.data:
        raise SystemExit(f"[radar-run] no run found for id={run_id}")
    sb.table("herb_radar_runs").update({
        "status": "RUNNING",
        "progress": "Starting up…",
        "error_message": None,
        "last_heartbeat": _now(),
    }).eq("id", run_id).execute()
    companies = run.data.get("companies") or []
    print(f"[radar-run] {len(companies)} companies to check")
    return {"run_id": run_id, "companies": companies}


def finish_radar_run(ctx: dict, findings: list[dict]) -> None:
    """findings: [{watch_id, pipedrive_deal_id, company_name, domain, update_type,
    headline, detail, source_url, confidence}] — NONE rows should already be
    dropped by the caller. watch_id is required (it's the dedupe/identity
    anchor — pipedrive_deal_id is optional since manually-added companies
    don't have one); rows missing it are skipped.

    Inserts ignore-on-conflict against the (watch_id, dedupe_key) unique
    constraint so a finding that resurfaces on a later tick is silently skipped
    rather than fuzzy-compared against prior text.
    """
    sb = _get_sb()
    run_id = ctx["run_id"]

    rows = []
    for f in findings:
        if not f.get("watch_id"):
            continue
        update_type = (f.get("update_type") or "").strip().upper()
        if update_type not in _UPDATE_TYPES:
            continue
        headline = (f.get("headline") or "").strip()
        if not headline:
            continue
        dedupe_source = (f.get("source_url") or headline).strip().lower()
        dedupe_key = re.sub(r"\s+", " ", dedupe_source)[:300]
        rows.append({
            "radar_run_id": run_id,
            "watch_id": f["watch_id"],
            "pipedrive_deal_id": f.get("pipedrive_deal_id"),
            "company_name": f.get("company_name") or "",
            "domain": f.get("domain") or "",
            "update_type": update_type,
            "headline": headline,
            "detail": (f.get("detail") or "").strip(),
            "source_url": (f.get("source_url") or "").strip(),
            "confidence": (f.get("confidence") or "").strip().upper(),
            "dedupe_key": dedupe_key,
        })

    written = 0
    if rows:
        result = (
            sb.table("herb_radar_findings")
            .upsert(rows, on_conflict="watch_id,dedupe_key", ignore_duplicates=True)
            .execute()
        )
        written = len(result.data or [])

    sb.table("herb_radar_runs").update({
        "status": "DONE",
        "findings_count": written,
        "progress": f"Complete — {written} new finding(s)",
        "last_heartbeat": _now(),
        "finished_at": _now(),
    }).eq("id", run_id).execute()
    print(f"[radar-run] wrote {written} findings ({len(findings)} candidate rows)")


def fail_radar_run(ctx: dict | None, exc: BaseException) -> None:
    import traceback
    print(f"[radar-run] FAILED: {type(exc).__name__}: {exc}")
    print(traceback.format_exc())
    if ctx and ctx.get("run_id"):
        try:
            _get_sb().table("herb_radar_runs").update({
                "status": "ERROR",
                "error_message": str(exc)[:500],
                "progress": f"Failed: {str(exc)[:200]}",
                "last_heartbeat": _now(),
                "finished_at": _now(),
            }).eq("id", ctx["run_id"]).execute()
        except Exception:
            pass
    raise SystemExit(1)
