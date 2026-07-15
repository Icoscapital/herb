"""
Select theme-relevant VC funds from references/vc-universe.xlsx for a mandate.

Usage (from repo root):
    python -m scripts.vc_filter --keywords "enzyme,biocatalysis,fermentation" \
        --regions EU,JP,US

Scores each fund by keyword hits across Preferred Industry / Preferred Verticals /
Description (industry/vertical hits weigh double). Selection is THRESHOLD-based,
not top-N: every fund with a genuine keyword match (score >= --min-score) is
returned, up to a --max safety ceiling. When genuine matches are scarce (<30),
generic on-thesis funds (climate/food/chemicals/industrial) top the list up to 30
so narrow themes still get a workable portfolio-scrape set.

Prints a pipe-delimited table (no header):
    Investor | Region | HQ | Website | Inv5y
plus a funnel summary on stderr:
    [vc_filter] 5,070 universe -> 1,489 in regions -> 87 matched (>=1.0) -> 87 emitted

Token-cheap by design: the agent runs this instead of reading the 5k-row xlsx.
"""
import argparse
import re
from pathlib import Path

import openpyxl

UNIVERSE = Path(__file__).resolve().parent.parent / "references" / "vc-universe.xlsx"

# Generic thesis terms that qualify a fund even when mandate keywords don't hit
# (keeps clearly on-thesis climate/industrial funds in play for adjacent themes).
THESIS_TERMS = [
    "climate", "cleantech", "clean tech", "sustainab", "decarbon", "carbon",
    "food", "agri", "agtech", "nutrition", "chemical", "material", "industrial",
    "deep tech", "deeptech", "biotech", "bioeconomy", "energy transition",
]


def tokenize_keywords(raw: str) -> list[str]:
    return [k.strip().lower() for k in raw.split(",") if k.strip()]


def main() -> None:
    import sys

    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords", required=True,
                    help="comma-separated mandate keywords")
    ap.add_argument("--regions", default="EU,JP,US",
                    help="comma-separated regions (EU,JP,US,Other)")
    ap.add_argument("--min-score", type=float, default=1.0,
                    help="relevance floor: 1.0 = at least one real keyword hit")
    ap.add_argument("--max", type=int, default=250,
                    help="safety ceiling on emitted funds (broad themes)")
    ap.add_argument("--top", type=int, default=None,
                    help="legacy alias for --max (kept for old prompts)")
    ap.add_argument("--min-inv5y", type=int, default=0,
                    help="optional extra activity floor")
    args = ap.parse_args()
    ceiling = args.top if args.top is not None else args.max

    keywords = tokenize_keywords(args.keywords)
    regions = {r.strip().upper() for r in args.regions.split(",") if r.strip()}

    wb = openpyxl.load_workbook(UNIVERSE, read_only=True)
    ws = wb["Universe"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}

    universe_n = 0
    region_n = 0
    scored = []
    for r in rows:
        if not r or not r[col["Investor"]]:
            continue
        universe_n += 1
        if str(r[col["Region"]]).upper() not in regions:
            continue
        region_n += 1
        inv5y = r[col["Investments Last 5y"]]
        try:
            inv5y = int(inv5y)
        except (TypeError, ValueError):
            inv5y = 0
        if inv5y < args.min_inv5y:
            continue

        ind = str(r[col["Preferred Industry"]] or "").lower()
        ver = str(r[col["Preferred Verticals"]] or "").lower()
        desc = str(r[col["Description"]] or "").lower()
        structured = ind + " | " + ver

        score = 0
        for kw in keywords:
            if kw in structured:
                score += 2
            elif kw in desc:
                score += 1
        if score == 0:
            # generic thesis fallback at low weight
            if any(t in structured or t in desc for t in THESIS_TERMS):
                score = 0.5

        if score > 0:
            scored.append((score, inv5y, r))

    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)

    # Threshold selection: ALL genuine matches (score >= min_score), capped by
    # the safety ceiling. If genuine matches are scarce, pad with generic
    # on-thesis funds (the 0.5-scored fallback) up to 30 total.
    genuine = [t for t in scored if t[0] >= args.min_score]
    fallback = [t for t in scored if t[0] < args.min_score]
    selected = genuine[:ceiling]
    if len(selected) < 30:
        selected += fallback[: 30 - len(selected)]

    for score, inv5y, r in selected:
        name = str(r[col["Investor"]]).strip()
        region = r[col["Region"]]
        hq = str(r[col["HQ Location"]] or "").strip()
        site = str(r[col["Website"]] or "").strip()
        print(f"{name} | {region} | {hq} | {site} | {inv5y}")

    capped = " (CAPPED — raise --max to widen)" if len(genuine) > ceiling else ""
    sys.stderr.write(
        f"[vc_filter] {universe_n:,} universe -> {region_n:,} in regions -> "
        f"{len(genuine)} matched (>={args.min_score}) -> {len(selected)} emitted{capped}\n")

    if not scored:
        print("no matching funds")


if __name__ == "__main__":
    main()
