"""Read/write run-state.md files in runs/[slug]/.

run-state.md is plain markdown with `key: value` lines under sections. We parse them as a flat
dict (last-wins on duplicates) — sections are preserved when writing back.

Usage:
    from scripts import run_state
    state = run_state.read("2026-05-07-enzyme-design")
    state["status"] = "WAITING_FEEDBACK"
    state["round_2_sent"] = "2026-05-09T11:00:00Z"
    run_state.write("2026-05-07-enzyme-design", state)
"""
from __future__ import annotations
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNS_DIR = REPO_ROOT / "runs"

KV_RE = re.compile(r"^([a-zA-Z0-9_]+)\s*:\s*(.+)$")


def run_dir(slug: str) -> Path:
    return RUNS_DIR / slug


def state_path(slug: str) -> Path:
    return run_dir(slug) / "run-state.md"


def exists(slug: str) -> bool:
    return state_path(slug).is_file()


def read(slug: str) -> dict:
    """Parse run-state.md into a flat dict. Heading lines and blank lines are ignored."""
    p = state_path(slug)
    if not p.is_file():
        raise FileNotFoundError(f"run-state.md not found for slug '{slug}': {p}")
    out: dict[str, str] = {}
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = KV_RE.match(line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def write(slug: str, state: dict, *, mandate_block: str | None = None) -> Path:
    """Write run-state.md. Layout: standard sections (Identity, Mandate, Round tracking, Stats,
    Pipedrive entries, Files) — fields placed in their natural section by key prefix.

    For an initial create (no prior file), pass mandate_block as the multi-line "Mandate" body.
    For updates, the existing layout is preserved by reading + merging; missing keys are added
    under the right section.
    """
    p = state_path(slug)
    p.parent.mkdir(parents=True, exist_ok=True)

    # Section ordering + key membership
    sections = [
        ("Identity",           ["run_id", "author", "started", "status"]),
        ("Mandate",            ["theme", "keywords", "geography", "stage",
                                "special_instructions", "search_mode"]),
        ("Intake files received", ["pipedrive_input", "pitchbook_input",
                                   "custom_list", "custom_list_2", "check_sites"]),
        ("Round tracking",     ["current_round", "round_1_sent", "round_1_feedback_received",
                                "round_1_feedback", "round_2_started", "round_2_sent",
                                "round_2_focus", "round_3_sent",
                                "finally_ok_received", "finalize_started", "t5_sent",
                                "round_2_method", "finalize_picks_for_eval"]),
        ("Stats",              ["companies_found_total", "pipedrive_duplicates_removed",
                                "pre_screen_passes", "icos_fit_evals_run",
                                "proceed_count", "monitor_count", "pass_count", "skipped_count"]),
        ("Pipedrive entries",  ["deals_created", "deal_names"]),
        ("Files",              ["longlist_v1", "longlist_v2", "longlist_v3",
                                "final_longlist", "final_summary"]),
    ]

    used = set()
    lines: list[str] = [f"# Herb Run State — {slug}", ""]
    for sect_name, keys in sections:
        body_lines = []
        for k in keys:
            if k in state:
                body_lines.append(f"{k}: {state[k]}")
                used.add(k)
        if body_lines or (sect_name == "Mandate" and mandate_block):
            lines.append(f"## {sect_name}")
            if sect_name == "Mandate" and mandate_block and not body_lines:
                lines.append(mandate_block.strip())
            else:
                lines.extend(body_lines)
            lines.append("")

    # Any stray keys land in a trailing section so nothing's lost
    leftover = {k: v for k, v in state.items() if k not in used}
    if leftover:
        lines.append("## Other")
        for k, v in leftover.items():
            lines.append(f"{k}: {v}")
        lines.append("")

    p.write_text("\n".join(lines), encoding="utf-8")
    return p


def initial(slug: str, *, author: str, theme: str, keywords: str = "",
            geography: str = "Europe", stage: str = "Series A / B",
            special_instructions: str = "none", search_mode: str = "STANDARD",
            started_iso: str | None = None) -> Path:
    """Create a fresh run-state.md for a new activation. Status = WAITING_START."""
    from datetime import datetime, timezone
    started = started_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state = {
        "run_id": slug,
        "author": author,
        "started": started,
        "status": "WAITING_START",
        "theme": theme,
        "keywords": keywords,
        "geography": geography,
        "stage": stage,
        "special_instructions": special_instructions,
        "search_mode": search_mode,
        "current_round": "0",
        "round_1_sent": "pending",
        "round_2_sent": "pending",
        "round_3_sent": "pending",
        "finally_ok_received": "pending",
        "companies_found_total": "0",
        "pipedrive_duplicates_removed": "0",
        "pre_screen_passes": "0",
        "icos_fit_evals_run": "0",
        "proceed_count": "0",
        "monitor_count": "0",
        "pass_count": "0",
        "deals_created": "0",
        "deal_names": "[]",
        "longlist_v1": "none",
        "longlist_v2": "none",
        "longlist_v3": "none",
        "final_longlist": "none",
        "final_summary": "none",
    }
    return write(slug, state)


def list_active() -> list[str]:
    """Return slugs of runs whose status is not COMPLETED / ABANDONED."""
    if not RUNS_DIR.is_dir():
        return []
    out = []
    for d in sorted(RUNS_DIR.iterdir()):
        if not d.is_dir():
            continue
        try:
            s = read(d.name)
        except FileNotFoundError:
            continue
        if s.get("status", "").upper() not in ("COMPLETED", "ABANDONED"):
            out.append(d.name)
    return out
