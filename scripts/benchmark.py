"""
Golden-mandate benchmark — measures recall so improvements are numbers, not vibes.

Usage (env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_PAT for dispatch):

    python -m scripts.benchmark --list
    python -m scripts.benchmark --dispatch causal-ai-europe
        creates a PENDING run (slug benchmark-<key>-<date>) and fires the
        normal run-web-mandate workflow. Costs a real run (~$2-3).
    python -m scripts.benchmark --check causal-ai-europe
        finds the latest benchmark run for that key, compares its longlist
        to the expected companies, prints recall + misses.
    python -m scripts.benchmark --check-all
        recall table for every key that has a completed benchmark run.

A miss = an expected company absent from the longlist (domain match first,
fuzzy name >= 0.85 fallback). Expected lists are floors — extra finds are fine.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from .herb_web_run import _get_sb

GOLDEN = Path(__file__).resolve().parent.parent / "benchmarks" / "golden.json"


def _load() -> dict:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    data.pop("_readme", None)
    return data


def _norm_dom(d: str | None) -> str:
    s = (d or "").strip().lower()
    for p in ("https://", "http://"):
        if s.startswith(p):
            s = s[len(p):]
    return s.removeprefix("www.").split("/")[0]


def _norm_name(n: str | None) -> str:
    return "".join(ch for ch in (n or "").lower() if ch.isalnum())


def dispatch(key: str) -> int:
    import requests
    golden = _load()
    if key not in golden:
        print(f"unknown key '{key}' — options: {', '.join(golden)}")
        return 2
    pat = os.environ.get("GH_PAT", "")
    if not pat:
        print("GH_PAT not set — cannot dispatch")
        return 1
    g = golden[key]
    sb = _get_sb()
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    slug = f"benchmark-{key}-{date}"[:80]
    row = {
        "theme": g["theme"],
        "geography": g["geography"],
        "stage": g["stage"],
        "search_mode": g.get("search_mode", "DEEP"),
        "special_instructions": "BENCHMARK RUN — normal search, no special treatment.",
        "submitted_by_email": "nlal@icoscapital.com",
        "submitted_by_name": "Herb Benchmark",
        "slug": slug, "status": "PENDING", "current_round": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **({"seed_companies": g["seeds"]} if g.get("seeds") else {}),
    }
    ins = sb.table("herb_runs").insert(row).select("id").execute()
    run_id = (ins.data or [{}])[0].get("id")
    if not run_id:
        print("insert failed")
        return 1
    r = requests.post(
        "https://api.github.com/repos/Icoscapital/herb/dispatches",
        headers={"Authorization": f"Bearer {pat}",
                 "Accept": "application/vnd.github+json", "User-Agent": "herb-benchmark"},
        json={"event_type": "run-web-mandate", "client_payload": {"run_id": run_id}},
        timeout=30,
    )
    if r.status_code != 204:
        print(f"dispatch failed: {r.status_code} {r.text[:200]}")
        return 1
    print(f"[benchmark] dispatched {key} as run {run_id} (slug {slug})")
    print("[benchmark] check back after completion: python -m scripts.benchmark --check " + key)
    return 0


def check(key: str, verbose: bool = True) -> dict | None:
    golden = _load()
    if key not in golden:
        print(f"unknown key '{key}'")
        return None
    sb = _get_sb()
    runs = (sb.table("herb_runs").select("id,slug,status,created_at,result_count")
            .like("slug", f"benchmark-{key}-%")
            .order("created_at", desc=True).limit(1).execute()).data or []
    if not runs:
        if verbose:
            print(f"{key}: no benchmark run yet — dispatch one first")
        return None
    run = runs[0]
    if run["status"] not in ("DONE", "EMAILED", "COMPLETED"):
        if verbose:
            print(f"{key}: latest run is {run['status']} — wait for completion")
        return None
    found = (sb.table("herb_longlist").select("name,website")
             .eq("run_id", run["id"]).execute()).data or []
    found_doms = {_norm_dom(r.get("website")) for r in found} - {""}
    found_names = [_norm_name(r.get("name")) for r in found]

    hits, misses = [], []
    for exp in golden[key]["expected"]:
        dom, name = _norm_dom(exp.get("domain")), _norm_name(exp["name"])
        ok = (dom and dom in found_doms) or any(
            difflib.SequenceMatcher(None, name, fn).ratio() >= 0.85 for fn in found_names)
        (hits if ok else misses).append(exp["name"])

    recall = len(hits) / max(len(hits) + len(misses), 1)
    result = {"key": key, "run_id": run["id"], "total_found": len(found),
              "recall": recall, "hits": hits, "misses": misses}
    if verbose:
        print(f"\n=== {key} (run {run['id'][:8]}, {len(found)} companies) ===")
        print(f"Recall: {len(hits)}/{len(hits) + len(misses)} = {recall:.0%}")
        if misses:
            print("MISSED: " + ", ".join(misses))
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--dispatch", metavar="KEY")
    ap.add_argument("--check", metavar="KEY")
    ap.add_argument("--check-all", action="store_true")
    args = ap.parse_args()
    if args.list:
        for k, g in _load().items():
            print(f"{k:28s} {len(g['expected'])} expected — {g['theme'][:60]}")
        return 0
    if args.dispatch:
        return dispatch(args.dispatch)
    if args.check:
        return 0 if check(args.check) else 1
    if args.check_all:
        for k in _load():
            check(k)
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
