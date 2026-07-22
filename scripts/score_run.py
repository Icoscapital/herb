"""
Score-only helpers — Icos Fit scoring for an already-completed run.

Used by score_only_prompt.md when the author skipped scoring at submission
("Score Icos Fit" unchecked) and later clicks "Score Icos Fit" on the results
page. The run's longlist already exists in Supabase; this scores the eligible
rows in place without re-searching, re-storing, or re-emailing.

    from scripts.score_run import start_scoring, finish_scoring, fail_scoring
    ctx = start_scoring()          # run meta + eligible unscored rows
    ...                            # Claude dispatches Opus scoring sub-agents
    finish_scoring(ctx, scores)    # writes scores + notes back
"""
from __future__ import annotations

import os
import re

from .herb_web_run import _get_sb, update_progress


def _eligible(row: dict) -> bool:
    """Unscored, passed pre-screen, not already in Pipedrive as Open/Won/Lost."""
    if row.get("score") is not None:
        return False
    notes = row.get("notes") or ""
    if re.search(r"Pre-screen:\s*Fail", notes, re.I):
        return False
    if re.search(r"Pipedrive:\s*(Open|Won|Lost)", notes, re.I):
        return False
    return True


def start_scoring() -> dict:
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("[score-run] RUN_ID env var is empty")
    sb = _get_sb()
    run = sb.table("herb_runs").select("*").eq("id", run_id).single().execute()
    if not run.data:
        raise SystemExit(f"[score-run] no run found for id={run_id}")
    rows = (sb.table("herb_longlist").select("*").eq("run_id", run_id)
            .order("created_at", desc=False).execute()).data or []
    eligible = [r for r in rows if _eligible(r)]
    update_progress(run_id, f"Icos Fit scoring: {len(eligible)} of {len(rows)} rows eligible")
    print(f"[score-run] {run.data['theme'][:60]} — {len(eligible)} rows to score")
    return {
        "run_id": run_id,
        "theme": run.data["theme"],
        "special_instructions": run.data.get("special_instructions") or "",
        "status": run.data["status"],
        "companies": [
            {k: r.get(k) for k in
             ("id", "name", "description", "website", "stage", "geography", "source", "notes")}
            for r in eligible
        ],
    }


def finish_scoring(ctx: dict, scores: list[dict]) -> None:
    """scores: [{id, score (0-10 int), rationale, question}] — updates rows in place."""
    sb = _get_sb()
    run_id = ctx["run_id"]
    by_id = {c["id"]: c for c in ctx["companies"]}
    written = 0
    for s in scores:
        row = by_id.get(s.get("id"))
        if row is None or s.get("score") is None:
            continue
        fit_note = f"Fit: {s.get('rationale', '').strip()}"
        if s.get("question", "").strip():
            fit_note += f" | Q: {s['question'].strip()}"
        notes = row.get("notes") or ""
        sb.table("herb_longlist").update({
            "score": max(0, min(10, int(s["score"]))),
            "notes": f"{notes} | {fit_note}" if notes else fit_note,
        }).eq("id", s["id"]).execute()
        written += 1
    update_progress(run_id, f"Icos Fit scoring complete — {written} companies scored")
    print(f"[score-run] wrote {written} scores")


def fail_scoring(ctx: dict | None, exc: BaseException) -> None:
    """Record the failure in progress (run keeps its DONE/EMAILED status)."""
    import traceback
    print(f"[score-run] FAILED: {type(exc).__name__}: {exc}")
    print(traceback.format_exc())
    if ctx and ctx.get("run_id"):
        try:
            update_progress(ctx["run_id"], f"Icos Fit scoring failed: {str(exc)[:180]}")
        except Exception:
            pass
    raise SystemExit(1)
