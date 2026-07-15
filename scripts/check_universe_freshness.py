"""
PitchBook universe freshness check.

Runs monthly via .github/workflows/herb-universe-refresh.yml. When
references/vc-universe.xlsx was last committed more than MAX_AGE_DAYS ago,
emails the team a refresh request containing the exact PitchBook screener
profile to re-run (references/vc-universe-refresh.md).

Keying off the file's last COMMIT date means refreshing the file — whenever
it happens — resets the clock automatically. No calendar bookkeeping.

Usage:
    python -m scripts.check_universe_freshness            # email if stale
    python -m scripts.check_universe_freshness --dry-run  # print, never email

Env: GRAPH_TENANT_ID/GRAPH_CLIENT_ID/GRAPH_CLIENT_SECRET (send), or --dry-run.
Requires a full git checkout (fetch-depth: 0) for the commit date.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
UNIVERSE = REPO / "references" / "vc-universe.xlsx"
PROFILE = REPO / "references" / "vc-universe-refresh.md"
MAX_AGE_DAYS = 182          # ~6 months
RECIPIENT = "nlal@icoscapital.com"


def last_commit_date(path: Path) -> datetime | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", str(path.relative_to(REPO))],
            cwd=REPO, capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return datetime.fromisoformat(out) if out else None
    except Exception as e:
        print(f"[freshness] git log failed: {e}")
        return None


def universe_stats() -> str:
    try:
        import openpyxl
        wb = openpyxl.load_workbook(UNIVERSE, read_only=True)
        n = wb["Universe"].max_row - 1
        wb.close()
        return f"{n:,} funds"
    except Exception:
        return "unreadable"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    committed = last_commit_date(UNIVERSE)
    if committed is None:
        print("[freshness] could not determine file age (shallow checkout?) — skipping")
        return 0
    age = (datetime.now(timezone.utc) - committed.astimezone(timezone.utc)).days
    print(f"[freshness] vc-universe.xlsx last refreshed {committed.date()} "
          f"({age} days ago, {universe_stats()})")
    if age <= MAX_AGE_DAYS:
        print(f"[freshness] fresh enough (limit {MAX_AGE_DAYS}d) — nothing to do")
        return 0

    profile = PROFILE.read_text(encoding="utf-8") if PROFILE.exists() else \
        "See references/vc-universe-refresh.md in the herb repo."
    subject = f"Herb — PitchBook fund universe is {age // 30} months old, please refresh"
    body = (
        f"Hi,\n\n"
        f"Herb's VC fund universe (references/vc-universe.xlsx, {universe_stats()}) "
        f"was last refreshed on {committed.date()} — {age} days ago. Portfolio "
        f"scraping quality degrades as new funds go missing from the universe.\n\n"
        f"Please re-run the PitchBook export below and commit it to the repo. "
        f"Committing the new file automatically resets this reminder.\n\n"
        f"{'-' * 60}\n{profile}\n{'-' * 60}\n\n"
        f"Best,\nHerb"
    )
    if args.dry_run:
        print(f"[freshness] DRY RUN — would email {RECIPIENT}:")
        print(f"  Subject: {subject}")
        print(body[:600])
        return 0
    from .email_send import send_email
    send_email(RECIPIENT, subject, body)
    print(f"[freshness] refresh reminder sent to {RECIPIENT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
