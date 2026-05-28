"""
High-level entry points for the web-mandate prompt.

These functions exist so the prompt itself can stay tiny — every step that
is deterministic boilerplate (fetching the run, marking statuses, sending
the completion email, committing state) lives here instead of being inlined
into the Markdown prompt that Claude reads every turn.

Usage in the prompt:
    from scripts.run_web_mandate import start_run, finish_run, fail_run
    ctx = start_run()                         # fetch + mark SEARCHING + load attachments
    ...                                       # Claude drives Phase 2 search
    finish_run(ctx, companies)                # store + DONE + email + EMAILED + commit
"""
from __future__ import annotations
import os
import time
from .herb_web_run import (
    get_mandate_by_id,
    mark_searching,
    mark_done,
    mark_emailed,
    mark_error,
    store_results,
    update_progress,
    load_attachments,
    _get_sb,  # for idempotency checks
)
from .email_send import send_email


def start_run() -> dict:
    """Fetch run by $RUN_ID, mark SEARCHING, load attachments, return prep context."""
    run_id = os.environ.get("RUN_ID", "").strip()
    if not run_id:
        raise SystemExit("[run-web-mandate] RUN_ID env var is empty")

    mandates = get_mandate_by_id(run_id)
    if not mandates:
        raise SystemExit(f"[run-web-mandate] no run found for id={run_id}")

    m = mandates[0]
    print(f"[run-web-mandate] processing {run_id}: {m['theme'][:60]}")
    mark_searching(m["id"])

    additional, check_sites = load_attachments(m["id"])
    update_progress(
        m["id"],
        f"Loaded {len(additional)} attachment companies, {len(check_sites)} check-sites",
    )

    return {
        "run_id":               m["id"],
        "theme":                m["theme"],
        "geography":            m.get("geography") or "Europe",
        "stage":                m.get("stage") or "Series A/B",
        "search_mode":          (m.get("search_mode") or "DEEP").upper(),
        "special_instructions": m.get("special_instructions") or "",
        "submitted_by_email":   m.get("submitted_by_email"),
        "submitted_by_name":    m.get("submitted_by_name") or "",
        "additional_companies": additional,
        "extra_check_sites":    check_sites,
        "t_start":              time.time(),
    }


def finish_run(ctx: dict, companies: list[dict]) -> None:
    """Store results, mark DONE, email the submitter, mark EMAILED, commit.

    Idempotent: if this run is already EMAILED (e.g. workflow was retried
    after a partial success), we skip the email + commit and just refresh
    the result count. The submitter doesn't get a second email.
    """
    run_id = ctx["run_id"]

    # Idempotency check — has this run already been emailed?
    sb = _get_sb()
    existing = sb.table("herb_runs").select("status").eq("id", run_id).single().execute()
    already_emailed = (existing.data or {}).get("status") == "EMAILED"

    store_results(run_id, companies)
    duration = int(time.time() - ctx["t_start"])
    mark_done(run_id, len(companies), duration)

    if already_emailed:
        print(f"[run-web-mandate] run {run_id} was already EMAILED — skipping resend")
        # Restore EMAILED status (mark_done flipped us back to DONE)
        sb.table("herb_runs").update({"status": "EMAILED"}).eq("id", run_id).execute()
        return

    first_name = (ctx["submitted_by_name"].split() or ["there"])[0]
    dashboard_url = f"https://herb-tau.vercel.app/dashboard/mandates/{run_id}"
    subject = f"Herb — Results ready: {ctx['theme'][:50]}"
    body = (
        f"Hi {first_name},\n\n"
        "Your Herb search is complete.\n\n"
        f"Theme:   {ctx['theme']}\n"
        f"Results: {len(companies)} companies\n\n"
        "View the full longlist here:\n"
        f"{dashboard_url}\n\n"
        "Best,\nHerb"
    )
    if ctx.get("submitted_by_email"):
        # Atomic transition: only send + mark EMAILED if status is still DONE.
        # If a concurrent worker beat us to it, the update affects 0 rows and
        # we skip the email.
        claim = (
            sb.table("herb_runs")
            .update({"status": "EMAILING"})
            .eq("id", run_id)
            .eq("status", "DONE")
            .execute()
        )
        if claim.data:
            send_email(ctx["submitted_by_email"], subject, body)
            mark_emailed(run_id)
        else:
            print(f"[run-web-mandate] concurrent worker already started email for {run_id} — skipping")
    else:
        print("[run-web-mandate] no submitter email — skipping send + EMAILED transition")

    # Best-effort git commit of any state changes; never block completion on this.
    try:
        os.system(f'python -m scripts.git_state commit "web mandate {run_id} complete"')
    except Exception as e:
        print(f"[run-web-mandate] git commit failed (non-fatal): {e}")


def fail_run(ctx: dict | None, exc: BaseException) -> None:
    """Record an error against the run row, then re-raise.

    Re-raising is important: if Claude calls fail_run and then quietly exits
    `claude -p` returns 0, the GitHub Actions job shows green, and any
    alerting on failed workflows misses the failure. SystemExit(1) here
    propagates a non-zero exit code up through the CLI to the runner.
    """
    import traceback
    tb = traceback.format_exc()
    if ctx and ctx.get("run_id"):
        try:
            # Store a useful summary (mark_error truncates to 500 chars)
            mark_error(ctx["run_id"], f"{type(exc).__name__}: {exc}")
        except Exception as inner:
            print(f"[run-web-mandate] mark_error failed: {inner}")
    print(f"[run-web-mandate] FAILED: {type(exc).__name__}: {exc}")
    print(f"[run-web-mandate] traceback:\n{tb}")
    # Force a non-zero exit so the GitHub Actions job is marked failed
    raise SystemExit(1)
