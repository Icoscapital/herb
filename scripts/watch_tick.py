"""
Watch-mode ticker — monthly re-run of watched mandates, diff-only results.

Invoked by .github/workflows/herb-watch.yml (cron, 1st of each month).
For every watched lineage:
  1. Take the newest completed round that has watch=true
  2. Skip if the lineage already has a run in flight, or the newest round
     is younger than MIN_AGE_DAYS (guards double-fires and manual re-runs)
  3. Create the next-round PENDING row (inherits mandate settings,
     watch flag moves to the new row)
  4. Dispatch the run-web-mandate workflow for it

The mandate prompt sees ctx['watch']=True + current_round>1 and drops every
company already found in earlier rounds — so the completion email contains
only NEW companies since the last tick.

Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_PAT.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime, timezone, timedelta

import requests

from .herb_web_run import _get_sb

GH_REPO = "Icoscapital/herb"
MIN_AGE_DAYS = 25          # don't re-fire a lineage more often than this
TERMINAL = ("DONE", "EMAILED", "COMPLETED")
IN_FLIGHT = ("PENDING", "SEARCHING", "EMAILING")


def _base(slug: str | None) -> str:
    return re.sub(r"-r\d+$", "", slug or "")


def _dispatch(run_id: str, pat: str) -> bool:
    r = requests.post(
        f"https://api.github.com/repos/{GH_REPO}/dispatches",
        headers={"Authorization": f"Bearer {pat}",
                 "Accept": "application/vnd.github+json",
                 "User-Agent": "herb-watch"},
        json={"event_type": "run-web-mandate", "client_payload": {"run_id": run_id}},
        timeout=30,
    )
    if r.status_code != 204:
        print(f"[watch] dispatch failed for {run_id}: {r.status_code} {r.text[:200]}")
    return r.status_code == 204


def main() -> int:
    pat = os.environ.get("GH_PAT", "")
    if not pat:
        print("[watch] GH_PAT not set — cannot dispatch")
        return 1
    sb = _get_sb()

    try:
        watched = (sb.table("herb_runs").select("*")
                   .eq("watch", True).in_("status", TERMINAL)
                   .order("created_at", desc=True).execute()).data or []
    except Exception as e:
        print(f"[watch] herb_runs.watch not queryable (migration applied?): {e}")
        return 0
    if not watched:
        print("[watch] no watched runs")
        return 0

    # newest watched run per lineage
    heads: dict[str, dict] = {}
    for r in watched:
        b = _base(r.get("slug"))
        if b and (b not in heads or (r.get("current_round") or 1) > (heads[b].get("current_round") or 1)):
            heads[b] = r

    fired = 0
    for base, head in heads.items():
        # lineage already running?
        in_flight = (sb.table("herb_runs").select("id,status")
                     .or_(f"slug.eq.{base},slug.like.{base}-r%")
                     .in_("status", IN_FLIGHT).execute()).data or []
        if in_flight:
            print(f"[watch] {base}: run in flight — skipping")
            continue
        # too soon?
        created = str(head.get("created_at") or "")[:19]
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(created).replace(tzinfo=timezone.utc)
        except ValueError:
            age = timedelta(days=999)
        if age < timedelta(days=MIN_AGE_DAYS):
            print(f"[watch] {base}: last round is {age.days}d old (<{MIN_AGE_DAYS}) — skipping")
            continue

        next_round = (head.get("current_round") or 1) + 1
        new_slug = f"{base}-r{next_round}"[:80]
        instructions = (head.get("special_instructions") or "").strip()
        marker = ("WATCH RE-RUN: report ONLY companies not found in previous rounds "
                  "of this mandate.")
        new_row = {
            "user_id": head.get("user_id"),
            "theme": head["theme"],
            "geography": head.get("geography"),
            "stage": head.get("stage"),
            "search_mode": head.get("search_mode"),
            "special_instructions": f"{instructions}\n{marker}".strip(),
            "submitted_by_email": head.get("submitted_by_email"),
            "submitted_by_name": head.get("submitted_by_name"),
            "slug": new_slug,
            "status": "PENDING",
            "current_round": next_round,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "watch": True,
            "icos_fit": head.get("icos_fit") is True,
            **({"seed_companies": head["seed_companies"]} if head.get("seed_companies") else {}),
            **({"exhaustive": True} if head.get("exhaustive") else {}),
            **({"include_small": True} if head.get("include_small") else {}),
        }
        ins = sb.table("herb_runs").insert(new_row).select("id").execute()
        new_id = (ins.data or [{}])[0].get("id")
        if not new_id:
            print(f"[watch] {base}: insert failed — skipping")
            continue
        # watch flag lives on the newest round only
        sb.table("herb_runs").update({"watch": False}).eq("id", head["id"]).execute()
        if _dispatch(new_id, pat):
            fired += 1
            print(f"[watch] {base}: round {next_round} dispatched ({new_id})")

    print(f"[watch] done — {fired} lineage(s) re-run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
