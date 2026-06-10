"""
Select theme-relevant VC funds from references/vc-universe.xlsx for a mandate.

Usage (from repo root):
    python -m scripts.vc_filter --keywords "enzyme,biocatalysis,fermentation" \
        --regions EU,JP,US --top 50

Scores each fund by keyword hits across Preferred Industry / Preferred Verticals /
Description (industry/vertical hits weigh double), then ranks by score and recent
activity. Prints a pipe-delimited table (no header):
    Investor | Region | HQ | Website | Inv5y
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--keywords", required=True,
                    help="comma-separated mandate keywords")
    ap.add_argument("--regions", default="EU,JP,US",
                    help="comma-separated regions (EU,JP,US,Other)")
    ap.add_argument("--top", type=int, default=50)
    ap.add_argument("--min-inv5y", type=int, default=0,
                    help="optional extra activity floor")
    args = ap.parse_args()

    keywords = tokenize_keywords(args.keywords)
    regions = {r.strip().upper() for r in args.regions.split(",") if r.strip()}

    wb = openpyxl.load_workbook(UNIVERSE, read_only=True)
    ws = wb["Universe"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}

    scored = []
    for r in rows:
        if not r or not r[col["Investor"]]:
            continue
        if str(r[col["Region"]]).upper() not in regions:
            continue
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

    for score, inv5y, r in scored[: args.top]:
        name = str(r[col["Investor"]]).strip()
        region = r[col["Region"]]
        hq = str(r[col["HQ Location"]] or "").strip()
        site = str(r[col["Website"]] or "").strip()
        print(f"{name} | {region} | {hq} | {site} | {inv5y}")

    if not scored:
        print("no matching funds")


if __name__ == "__main__":
    main()
