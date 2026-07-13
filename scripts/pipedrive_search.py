"""
Pipedrive CRM theme search — surface companies Icos already knows.

Used as a search SOURCE in web mandates (both EU_ONLY and COMPREHENSIVE modes),
distinct from the per-company cross-check: this mines the CRM by theme keyword
so past deals (lost, went cold, watch-and-follow) that fit a new mandate
resurface on the longlist.

Usage:
    python -m scripts.pipedrive_search --keywords "causal AI, process optimization"
    python -m scripts.pipedrive_search --keywords "alt protein" --all-pipelines

Output (stdout): one pipe-delimited row per company, no header:
    Company | Domain | Status | Stage | LostReason | Updated | Description
If nothing matches: "PIPEDRIVE | no results".

Env: PIPEDRIVE_TOKEN (required), PIPEDRIVE_DOMAIN (default "icoscapital").
"""
from __future__ import annotations

import argparse
import os
import sys

from scripts.pipedrive_batch import batch_operations
from scripts.pipedrive_client import PipedriveClient
from scripts.schema_constants import DEAL_FIELD, ORG_FIELD, PIPELINE_ICOS

STAGE_NAMES = {
    96: "Data Entry", 137: "Leads", 141: "Deals to Discuss", 139: "Follow Up",
    145: "Corporate Follow-up", 144: "Advanced Follow-up",
    142: "Follow-on Portfolio", 99: "Quickscan", 100: "PUR/DD/FIP",
    107: "Watch & Follow",
}

MAX_DETAIL_FETCHES = 40  # cap on deal/org detail calls per run


def _clean(val) -> str:
    """Single-line, pipe-safe cell value."""
    if not val:
        return ""
    return " ".join(str(val).replace("|", "/").split())


def _domain(url: str) -> str:
    """Bare domain from whatever is in the website field."""
    s = (url or "").strip().lower()
    for prefix in ("https://", "http://"):
        if s.startswith(prefix):
            s = s[len(prefix):]
    if s.startswith("www."):
        s = s[4:]
    return s.split("/")[0].strip()


def search(client: PipedriveClient, keywords: list[str],
           limit_per_keyword: int, icos_pipeline_only: bool) -> list[dict]:
    # 1. Collect raw hits across all keywords
    deal_ids: dict[int, None] = {}       # insertion-ordered set
    org_only: dict[int, dict] = {}       # org hits (may be superseded by a deal)
    for kw in keywords:
        kw = kw.strip()
        if len(kw) < 2:
            continue
        try:
            for item in client.search_deals(kw, limit=limit_per_keyword):
                if item.get("id"):
                    deal_ids.setdefault(item["id"])
        except Exception as e:
            sys.stderr.write(f"WARN: deal search '{kw}' failed: {e}\n")
        try:
            for item in client.search_organizations_fulltext(kw, limit=limit_per_keyword):
                if item.get("id"):
                    org_only.setdefault(item["id"], item)
        except Exception as e:
            sys.stderr.write(f"WARN: org search '{kw}' failed: {e}\n")

    # 2. Deal details (status, stage, lost_reason, website, description, org)
    rows: list[dict] = []
    seen_orgs: set = set()
    seen_names: set = set()
    details = batch_operations(
        list(deal_ids)[:MAX_DETAIL_FETCHES], client.get_deal, "get_deal")
    for d in details:
        if not d:
            continue
        if icos_pipeline_only and d.get("pipeline_id") != PIPELINE_ICOS:
            continue
        org = d.get("org_id") or {}          # dict {name, value} on details
        org_id = org.get("value") if isinstance(org, dict) else org
        org_name = org.get("name") if isinstance(org, dict) else None
        name = org_name or d.get("title") or ""
        key = name.strip().lower()
        if not key or key in seen_names:
            continue
        seen_names.add(key)
        if org_id:
            seen_orgs.add(org_id)
        rows.append({
            "name": name,
            "domain": _domain(d.get(DEAL_FIELD["website"]) or ""),
            "status": d.get("status") or "",
            "stage": STAGE_NAMES.get(d.get("stage_id"), str(d.get("stage_id") or "")),
            "lost_reason": d.get("lost_reason") or "",
            "updated": (d.get("update_time") or "")[:10],
            "description": d.get(DEAL_FIELD["short_description"]) or "",
        })

    # 3. Org-only hits (in CRM but no deal record) — remaining detail budget
    budget = MAX_DETAIL_FETCHES - len(details)
    org_ids = [oid for oid in org_only if oid not in seen_orgs][:max(budget, 0)]
    for o in batch_operations(org_ids, client.get_organization, "get_organization"):
        if not o:
            continue
        name = o.get("name") or ""
        key = name.strip().lower()
        if not key or key in seen_names:
            continue
        seen_names.add(key)
        rows.append({
            "name": name,
            "domain": _domain(o.get(ORG_FIELD["website"]) or ""),
            "status": "org-only (no deal)",
            "stage": "",
            "lost_reason": "",
            "updated": (o.get("update_time") or "")[:10],
            "description": "",
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="Search Pipedrive CRM by theme keywords")
    ap.add_argument("--keywords", required=True,
                    help="comma-separated theme keywords, e.g. 'causal AI, process optimization'")
    ap.add_argument("--limit-per-keyword", type=int, default=20)
    ap.add_argument("--all-pipelines", action="store_true",
                    help="include deals outside the Icos dealflow pipeline")
    args = ap.parse_args()

    token = os.environ.get("PIPEDRIVE_TOKEN")
    if not token:
        sys.stderr.write("ERROR: PIPEDRIVE_TOKEN not set\n")
        return 1
    domain = os.environ.get("PIPEDRIVE_DOMAIN", "icoscapital")
    client = PipedriveClient(domain, token)

    keywords = [k for k in args.keywords.split(",") if k.strip()]
    rows = search(client, keywords, args.limit_per_keyword,
                  icos_pipeline_only=not args.all_pipelines)

    if not rows:
        print("PIPEDRIVE | no results")
        return 0
    for r in rows:
        print(" | ".join(_clean(r[c]) for c in
                         ("name", "domain", "status", "stage",
                          "lost_reason", "updated", "description")))
    sys.stderr.write(f"[pipedrive_search] {len(rows)} companies "
                     f"for keywords: {', '.join(k.strip() for k in keywords)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
