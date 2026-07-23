"""
Update Radar ticker — bi-weekly check of curated Pipedrive deals for market updates.

Invoked by .github/workflows/herb-radar.yml (cron: 1st + 15th of each month,
or manual workflow_dispatch, or repository_dispatch from the dashboard's
"Check now" button).

Unlike watch_tick.py (which re-runs sourcing mandates to find brand-new
companies), this checks EXISTING deals already in the pipeline for three
specific signal types: new financing (company or named competitor),
commercial updates (partnership/customer win), and major website/news.

Steps:
  1. Pull every open deal across the 4 target stages (Follow Up, Corporate
     Follow-up, Advanced Follow-up, PUR/DD/FIP).
  2. Upsert cached name/domain/stage into herb_radar_watch for every deal
     seen (so the dashboard's toggle list stays fresh without a live
     Pipedrive call on every page load). New deals default to enabled=True
     (opt-OUT — everyone in the target stages is checked automatically
     unless toggled off); an existing row's `enabled` is never overwritten
     here, so a manual toggle-off sticks across ticks.
  3. Read the curated set directly from herb_radar_watch (enabled=true) —
     this covers BOTH pipedrive-synced deals and companies added manually
     from the dashboard (source='manual', no Pipedrive deal at all).
  4. If the curated set is non-empty: insert one herb_radar_runs row
     (PENDING, companies = snapshot) and dispatch run-update-radar. If
     empty, exit quietly — no wasted Actions minutes.

Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_PAT,
     PIPEDRIVE_DOMAIN, PIPEDRIVE_TOKEN.
"""
from __future__ import annotations

import os
import sys

import requests

from .herb_web_run import _get_sb
from .pipedrive_client import PipedriveClient
from .schema_constants import (
    DEAL_FIELD,
    STAGE_ADVANCED_FOLLOWUP,
    STAGE_CORPORATE_FOLLOWUP,
    STAGE_FOLLOW_UP,
    STAGE_PUR_DD_FIP,
)

GH_REPO = "Icoscapital/herb"
TARGET_STAGES = (STAGE_FOLLOW_UP, STAGE_CORPORATE_FOLLOWUP, STAGE_ADVANCED_FOLLOWUP, STAGE_PUR_DD_FIP)


def _domain(website: str | None) -> str:
    if not website:
        return ""
    return (
        str(website).strip().lower()
        .replace("https://", "").replace("http://", "")
        .replace("www.", "").split("/")[0]
    )


def _resolve_deals(client: PipedriveClient) -> list[dict]:
    """Fetch + normalize every open deal across the target stages."""
    resolved: list[dict] = []
    seen_deal_ids: set[int] = set()
    for stage_id in TARGET_STAGES:
        for d in client.list_deals_by_stage(stage_id):
            deal_id = d.get("id")
            if not deal_id or deal_id in seen_deal_ids:
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


def _dispatch(run_id: str, pat: str) -> bool:
    r = requests.post(
        f"https://api.github.com/repos/{GH_REPO}/dispatches",
        headers={"Authorization": f"Bearer {pat}",
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "herb-radar"},
        json={"event_type": "run-update-radar", "client_payload": {"run_id": run_id}},
        timeout=30,
    )
    if r.status_code != 204:
        print(f"[radar] dispatch failed for {run_id}: {r.status_code} {r.text[:200]}")
    return r.status_code == 204


def main() -> int:
    pat = os.environ.get("GH_PAT", "")
    if not pat:
        print("[radar] GH_PAT not set — cannot dispatch")
        return 1
    domain = os.environ.get("PIPEDRIVE_DOMAIN", "icoscapital")
    token = os.environ.get("PIPEDRIVE_TOKEN", "")
    if not domain or not token:
        print("[radar] PIPEDRIVE_DOMAIN/PIPEDRIVE_TOKEN not set")
        return 1

    sb = _get_sb()
    client = PipedriveClient(domain, token)

    deals = _resolve_deals(client)
    print(f"[radar] {len(deals)} open deals across target stages")

    # Upsert cached name/domain/stage for every deal seen, without touching
    # `enabled` on existing rows (so a manual toggle-off sticks). New deals
    # default to enabled=True — opt-OUT, not opt-in: every deal in the target
    # stages is checked automatically unless someone turns it off.
    for deal in deals:
        existing = (sb.table("herb_radar_watch").select("id")
                    .eq("pipedrive_deal_id", deal["pipedrive_deal_id"]).execute()).data
        if existing:
            sb.table("herb_radar_watch").update({
                "company_name": deal["company_name"],
                "domain": deal["domain"],
                "stage_id": deal["stage_id"],
            }).eq("pipedrive_deal_id", deal["pipedrive_deal_id"]).execute()
        else:
            sb.table("herb_radar_watch").insert({
                "pipedrive_deal_id": deal["pipedrive_deal_id"],
                "company_name": deal["company_name"],
                "domain": deal["domain"],
                "stage_id": deal["stage_id"],
                "source": "pipedrive",
                "enabled": True,
            }).execute()

    # Curated set = every enabled row in herb_radar_watch, whether it's a
    # pipedrive-synced deal or a manually-added company. Descriptions for
    # pipedrive rows come from the live fetch above; manual rows have none.
    descriptions = {d["pipedrive_deal_id"]: d["description"] for d in deals}
    watch_rows = (sb.table("herb_radar_watch").select("*").eq("enabled", True).execute()).data or []
    curated = [
        {
            "watch_id": r["id"],
            "pipedrive_deal_id": r.get("pipedrive_deal_id"),
            "company_name": r["company_name"],
            "domain": r.get("domain") or "",
            "stage_id": r.get("stage_id"),
            "description": descriptions.get(r.get("pipedrive_deal_id"), ""),
        }
        for r in watch_rows
    ]
    if not curated:
        print("[radar] no companies enabled for the watch list — nothing to check")
        return 0

    ins = (sb.table("herb_radar_runs")
           .insert({"status": "PENDING", "companies": curated})
           .execute())
    run_id = (ins.data or [{}])[0].get("id")
    if not run_id:
        print("[radar] insert failed — aborting")
        return 1

    if _dispatch(run_id, pat):
        print(f"[radar] dispatched run {run_id} for {len(curated)} curated companies")
    else:
        sb.table("herb_radar_runs").update({
            "status": "ERROR",
            "error_message": "dispatch to run-update-radar failed",
        }).eq("id", run_id).execute()
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
