"""
Cross-mandate memory (herb_seen table).

Every company Herb surfaces is remembered: when it was first/last seen, in
which mandates, and what happened to it (longlisted / excluded / pushed to
Pipedrive). This turns each run into compounding knowledge:

  - annotate_seen()      — before storing, tag companies Herb has met before
  - record_seen()        — after storing, upsert this run's companies
  - previous_companies() — all companies from earlier rounds of a lineage
                           (used by watch mode to email only the NEW ones)

All functions are defensive: if the herb_seen table doesn't exist yet
(migration not applied), they log and return without breaking the run.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .herb_web_run import _get_sb


def company_key(c: dict) -> str:
    """Normalization shared with the web app: domain if known, else name."""
    dom = (c.get("website") or "").strip().lower()
    for p in ("https://", "http://"):
        if dom.startswith(p):
            dom = dom[len(p):]
    if dom.startswith("www."):
        dom = dom[4:]
    dom = dom.split("/")[0].strip()
    if dom and "." in dom:
        return dom
    return (c.get("name") or "").strip().lower()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def annotate_seen(companies: list[dict]) -> list[dict]:
    """Append 'Seen before' notes to companies already in herb_seen."""
    keys = [k for k in (company_key(c) for c in companies) if k]
    if not keys:
        return companies
    try:
        sb = _get_sb()
        seen: dict[str, dict] = {}
        for i in range(0, len(keys), 100):
            res = (sb.table("herb_seen").select("company_key,times_seen,last_seen_at,last_status,mandates")
                   .in_("company_key", keys[i:i + 100]).execute())
            for row in res.data or []:
                seen[row["company_key"]] = row
        hits = 0
        for c in companies:
            row = seen.get(company_key(c))
            if not row:
                continue
            hits += 1
            themes = {m.get("theme", "")[:40] for m in (row.get("mandates") or [])[-3:]}
            note = (f"Seen before: {row.get('times_seen', 1)}x, "
                    f"last {str(row.get('last_seen_at', ''))[:10]} ({row.get('last_status', 'longlisted')}"
                    + (f"; {'; '.join(t for t in themes if t)}" if themes else "") + ")")
            c["notes"] = f"{c['notes']} | {note}" if c.get("notes") else note
        print(f"[herb_memory] annotate_seen: {hits}/{len(companies)} previously known")
    except Exception as e:
        print(f"[herb_memory] annotate_seen skipped (non-fatal): {e}")
    return companies


def record_seen(run_id: str, theme: str, round_no: int, companies: list[dict]) -> None:
    """Upsert this run's companies into herb_seen. Never raises."""
    try:
        sb = _get_sb()
        entry = {"run_id": run_id, "theme": (theme or "")[:120],
                 "round": round_no, "at": _now()}
        by_key: dict[str, dict] = {}
        for c in companies:
            k = company_key(c)
            if k:
                by_key.setdefault(k, c)
        keys = list(by_key)
        existing: dict[str, dict] = {}
        for i in range(0, len(keys), 100):
            res = (sb.table("herb_seen").select("company_key,times_seen,mandates")
                   .in_("company_key", keys[i:i + 100]).execute())
            for row in res.data or []:
                existing[row["company_key"]] = row

        new_rows = []
        for k, c in by_key.items():
            if k in existing:
                row = existing[k]
                mandates = (row.get("mandates") or [])
                if not any(m.get("run_id") == run_id for m in mandates):
                    mandates = mandates[-19:] + [entry]
                sb.table("herb_seen").update({
                    "last_seen_at": _now(),
                    "times_seen": (row.get("times_seen") or 1) + 1,
                    "mandates": mandates,
                    "last_status": "longlisted",
                }).eq("company_key", k).execute()
            else:
                dom = k if "." in k else ""
                new_rows.append({
                    "company_key": k, "name": c.get("name", ""), "domain": dom,
                    "mandates": [entry], "last_status": "longlisted",
                })
        if new_rows:
            sb.table("herb_seen").insert(new_rows).execute()
        print(f"[herb_memory] record_seen: {len(new_rows)} new, {len(existing)} updated")
    except Exception as e:
        print(f"[herb_memory] record_seen skipped (non-fatal): {e}")


def previous_companies(slug: str, exclude_run_id: str | None = None) -> set[str]:
    """All company keys from earlier rounds of this slug's lineage.

    Returns a set of normalized keys (domains + lowercase names, both included
    per company so matching works whichever the new round captured).
    """
    keys: set[str] = set()
    try:
        import re
        base = re.sub(r"-r\d+$", "", slug or "")
        if not base:
            return keys
        sb = _get_sb()
        runs = (sb.table("herb_runs").select("id,slug")
                .or_(f"slug.eq.{base},slug.like.{base}-r%").execute())
        run_ids = [r["id"] for r in (runs.data or [])
                   if r["id"] != exclude_run_id]
        for i in range(0, len(run_ids), 20):
            res = (sb.table("herb_longlist").select("name,website")
                   .in_("run_id", run_ids[i:i + 20]).execute())
            for row in res.data or []:
                k = company_key(row)
                if k:
                    keys.add(k)
                nm = (row.get("name") or "").strip().lower()
                if nm:
                    keys.add(nm)
        print(f"[herb_memory] previous_companies({base}): {len(keys)} keys "
              f"from {len(run_ids)} earlier runs")
    except Exception as e:
        print(f"[herb_memory] previous_companies failed (non-fatal): {e}")
    return keys
