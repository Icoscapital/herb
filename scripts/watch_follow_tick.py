"""
Updates On Watch & Follow ticker — on-demand check of automatically-selected
Pipedrive deals for market updates.

Invoked by .github/workflows/herb-watch-follow-tick.yml — manual
workflow_dispatch, or repository_dispatch from the dashboard's "Check now"
button. No schedule; it only ticks when someone clicks the button.

Unlike watch_tick.py (which re-runs sourcing mandates to find brand-new
companies), this checks EXISTING deals already in the pipeline for three
specific signal types: new financing (company or named competitor),
commercial updates (partnership/customer win), and major website/news.

Renamed 2026-08-27 from radar_tick.py / "Update Radar" — the old name
collided with the unrelated sourcing-mandate "Watch" feature (watch_tick.py).
This rename also drops the manual opt-in watch list entirely: there is no
more herb_radar_watch table and no toggle. Every tick, the candidate set is
computed fresh, live, from Pipedrive:

  - Stage: the deal's pipeline-9 stage has order_nr >= 4 ("Corporate view"
    or any stage after it in board order). Stage ids/names on this pipeline
    have been renamed and reordered three times in the last week, so they
    are resolved live via GET /stages?pipeline_id=9 every run — never
    hardcoded.
  - Status: open, won, AND lost (not deleted) — status=all_not_deleted.
  - CEP Interest (DEAL_FIELD["corporate_interest"]) must be non-empty —
    some corporate has flagged interest. Herb has no per-corporate login
    concept (unlike Vantage), so any non-empty value qualifies.
  - Framework Verdict (DEAL_FIELD["framework_verdict"]) must NOT include
    option id 728 ("No Go - Not a fit"). Null/empty (not yet categorised)
    still qualifies.

This mirrors a Supabase function called radar_candidates() already built in
Vantage (a sibling app against the same Pipedrive account) — credit there
for the criteria definition.

Optionally narrowed by WATCH_FOLLOW_TERMS (2026-08-28) — key terms matched against company name,
description and domain. Additive to the criteria above, never a replacement: terms can only shrink
the qualifying set, so no keyword can pull in a deal the criteria excluded.

Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_PAT,
     PIPEDRIVE_DOMAIN, PIPEDRIVE_TOKEN, WATCH_FOLLOW_TERMS (optional).
"""
from __future__ import annotations

import os
import sys

import requests

from .herb_web_run import _get_sb
from .pipedrive_client import PipedriveClient
from .schema_constants import DEAL_FIELD, PIPELINE_ICOS

GH_REPO = "Icoscapital/herb"
FRAMEWORK_VERDICT_NO_GO = "728"
MIN_ORDER_NR = 4


def _domain(website: str | None) -> str:
    if not website:
        return ""
    return (
        str(website).strip().lower()
        .replace("https://", "").replace("http://", "")
        .replace("www.", "").split("/")[0]
    )


def _resolve_target_stages(client: PipedriveClient) -> list[int]:
    """Live lookup of every pipeline-9 stage at or past 'Corporate view' in
    board order — resolved by order_nr, never hardcoded (see module
    docstring)."""
    stages = client.list_stages(PIPELINE_ICOS)
    ordered = sorted(stages, key=lambda s: s.get("order_nr") or 0)
    return [s["id"] for s in ordered if (s.get("order_nr") or 0) >= MIN_ORDER_NR]


def _excluded_lost_reasons(sb) -> set[str]:
    """Lost reasons that take a company out entirely, from the table rather than hardcoded — the
    values are still being confirmed against Pipedrive's own Lost Reason options, and a literal that
    matches nothing is a filter that silently does nothing. Lowercased and stripped for comparison,
    because lost_reason is free text in practice ("no corporate buy-in" vs "No corporate buy-in")."""
    try:
        rows = (sb.table("herb_watch_follow_excluded_lost_reason")
                .select("lost_reason").execute()).data or []
    except Exception as e:
        # Non-fatal: a missing table must not stop a run, but say so rather than silently widening.
        print(f"[watch-follow] excluded-lost-reason table not queryable, no reasons excluded: {e}")
        return set()
    return {str(r["lost_reason"]).strip().lower() for r in rows if r.get("lost_reason")}


def _qualifies(deal: dict, excluded_reasons: set[str] = frozenset()) -> bool:
    """Not won AND CEP Interest non-empty AND Framework Verdict doesn't carry 'No Go' AND not lost
    for a reason that rules the company out permanently."""
    # Won deals are excluded (Nityen 2026-08-28): a won deal is one Icos invested in, so it is
    # portfolio rather than something to form a view on, and its news belongs in a portfolio review.
    # LOST stays in — a company Icos passed on can still interest a corporate, and a competitor raise
    # against one is still worth knowing.
    #
    # Filtered here rather than via the status query param: Pipedrive's /deals status accepts one of
    # open / won / lost / deleted / all_not_deleted, with no "open and lost" value — so narrowing at
    # the API would mean two paginated passes per stage instead of one.
    if deal.get("status") == "won":
        return False
    # A permanent mismatch (wrong business, model, geography) stops us watching; a timing or process
    # loss does not, since the company could become relevant again.
    reason = str(deal.get("lost_reason") or "").strip().lower()
    if reason and reason in excluded_reasons:
        return False
    cep_interest = deal.get(DEAL_FIELD["corporate_interest"])
    if not cep_interest:
        return False
    verdict = deal.get(DEAL_FIELD["framework_verdict"])
    if verdict:
        option_ids = {v.strip() for v in str(verdict).split(",") if v.strip()}
        if FRAMEWORK_VERDICT_NO_GO in option_ids:
            return False
    return True


def _resolve_deals(client: PipedriveClient, stage_ids: list[int],
                   excluded_reasons: set[str] = frozenset()) -> list[dict]:
    """Fetch + normalize every open or lost deal across the target stages that passes the
    not-won + CEP Interest + Framework Verdict criteria. Won deals are fetched (the API has no
    open-and-lost status) and dropped by _qualifies."""
    resolved: list[dict] = []
    seen_deal_ids: set[int] = set()
    for stage_id in stage_ids:
        for d in client.list_deals_by_stage(stage_id, status="all_not_deleted"):
            deal_id = d.get("id")
            if not deal_id or deal_id in seen_deal_ids:
                continue
            if not _qualifies(d, excluded_reasons):
                continue
            seen_deal_ids.add(deal_id)
            org = d.get("org_id") or {}
            resolved.append({
                "pipedrive_deal_id": deal_id,
                "company_name": (org.get("name") if isinstance(org, dict) else None) or d.get("title") or "",
                "domain": _domain(d.get(DEAL_FIELD["website"])),
                "stage_id": stage_id,
                "description": d.get(DEAL_FIELD["short_description"]) or "",
            })
    return resolved


def _matches_terms(deal: dict, groups: list[list[str]]) -> bool:
    """Same semantics as Vantage's search box, so the two agree: commas mean OR, spaces within a
    comma-separated phrase mean AND. "protein, packaging" matches either; "plant protein" needs both.

    Vantage gets this from a Postgres tsquery over an indexed tsvector; Herb has no local mirror to
    index, so it is a substring match over the fields we already fetched. The tradeoff is no stemming
    — Vantage's "protein" also matches "proteins", this does not — which is acceptable for narrowing
    a set someone is about to eyeball, and avoids a second round-trip per deal.
    """
    if not groups:
        return True
    haystack = " ".join([
        str(deal.get("company_name") or ""),
        str(deal.get("description") or ""),
        str(deal.get("domain") or ""),
    ]).lower()
    return any(all(word in haystack for word in group) for group in groups)


def _parse_terms(raw: str) -> list[list[str]]:
    """"protein, plant based" -> [["protein"], ["plant", "based"]]"""
    groups: list[list[str]] = []
    for part in raw.split(","):
        words = [w for w in part.strip().lower().split() if w]
        if words:
            groups.append(words)
    return groups


def _dispatch(run_id: str, pat: str) -> bool:
    r = requests.post(
        f"https://api.github.com/repos/{GH_REPO}/dispatches",
        headers={"Authorization": f"Bearer {pat}",
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "herb-watch-follow"},
        json={"event_type": "run-watch-follow", "client_payload": {"run_id": run_id}},
        timeout=30,
    )
    if r.status_code != 204:
        print(f"[watch-follow] dispatch failed for {run_id}: {r.status_code} {r.text[:200]}")
    return r.status_code == 204


def main() -> int:
    pat = os.environ.get("GH_PAT", "")
    if not pat:
        print("[watch-follow] GH_PAT not set — cannot dispatch")
        return 1
    domain = os.environ.get("PIPEDRIVE_DOMAIN", "icoscapital")
    token = os.environ.get("PIPEDRIVE_TOKEN", "")
    if not domain or not token:
        print("[watch-follow] PIPEDRIVE_DOMAIN/PIPEDRIVE_TOKEN not set")
        return 1

    sb = _get_sb()
    client = PipedriveClient(domain, token)

    stage_ids = _resolve_target_stages(client)
    print(f"[watch-follow] target stages resolved live: {stage_ids}")

    excluded_reasons = _excluded_lost_reasons(sb)
    if excluded_reasons:
        print(f"[watch-follow] excluding {len(excluded_reasons)} lost reason(s)")

    curated = _resolve_deals(client, stage_ids, excluded_reasons)
    print(f"[watch-follow] {len(curated)} deals qualify (stage + CEP interest + framework verdict)")

    # Optional keyword narrowing, applied AFTER the criteria so it can only ever shrink the set.
    terms = (os.environ.get("WATCH_FOLLOW_TERMS") or "").strip()
    if terms:
        groups = _parse_terms(terms)
        before = len(curated)
        curated = [d for d in curated if _matches_terms(d, groups)]
        print(f"[watch-follow] narrowed by {terms!r}: {before} -> {len(curated)}")

    if not curated:
        print("[watch-follow] no qualifying deals — nothing to check")
        return 0

    ins = (sb.table("herb_watch_follow_runs")
           .insert({"status": "PENDING", "companies": curated, "terms": terms or None})
           .execute())
    run_id = (ins.data or [{}])[0].get("id")
    if not run_id:
        print("[watch-follow] insert failed — aborting")
        return 1

    if _dispatch(run_id, pat):
        print(f"[watch-follow] dispatched run {run_id} for {len(curated)} qualifying companies")
    else:
        sb.table("herb_watch_follow_runs").update({
            "status": "ERROR",
            "error_message": "dispatch to run-watch-follow failed",
        }).eq("id", run_id).execute()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
