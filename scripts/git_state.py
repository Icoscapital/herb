"""Git helpers for routine sandbox: pull latest before reading state, commit+push after writing.

In the Anthropic Routine sandbox the repo is already cloned (origin set to the source repo from
session_context.sources). These helpers wrap the small set of git commands the orchestrator needs.

The routine clones with the GH App's identity by default; we explicitly set user.name/user.email
on first commit so the commit history is readable.

Usage from Bash inside the routine:
    python -m scripts.git_state pull
    python -m scripts.git_state commit "round 2 longlist + run-state update"
"""
from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
COMMIT_NAME = os.environ.get("GIT_COMMIT_NAME", "herb-bot")
COMMIT_EMAIL = os.environ.get("GIT_COMMIT_EMAIL", "herb@icoscapital.com")


def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    """Run a git command in the repo root, return the CompletedProcess."""
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=check,
    )


def ensure_identity() -> None:
    """Idempotent — sets user.name/email if not already set in this clone."""
    n = _git("config", "user.name", check=False).stdout.strip()
    if not n:
        _git("config", "user.name", COMMIT_NAME)
    e = _git("config", "user.email", check=False).stdout.strip()
    if not e:
        _git("config", "user.email", COMMIT_EMAIL)


def pull_latest() -> None:
    """Fast-forward pull. Routines run hourly so conflicts are vanishingly rare; if a conflict
    happens, we surface it loudly rather than silently overwrite."""
    ensure_identity()
    r = _git("pull", "--ff-only", check=False)
    if r.returncode != 0:
        sys.stderr.write(f"git pull --ff-only failed:\n{r.stderr}\n")
        sys.stderr.write("Aborting — investigate before next tick.\n")
        sys.exit(1)


def commit_and_push(message: str, paths: list[str] | None = None) -> bool:
    """Stage, commit, push. If there are no staged changes, no-op (returns False).

    Args:
        message: commit message (one-line summary; can include newlines for body)
        paths: list of paths to stage; None = stage all (`git add -A`)
    Returns:
        True if a commit was created and pushed; False if nothing to commit.
    """
    ensure_identity()
    if paths:
        _git("add", *paths)
    else:
        _git("add", "-A")

    # Anything to commit?
    r = _git("diff", "--cached", "--name-only", check=False)
    if not r.stdout.strip():
        return False

    _git("commit", "-m", message)

    # Push — retry once on remote update
    r = _git("push", "origin", "HEAD", check=False)
    if r.returncode != 0:
        # Pull then retry once
        sys.stderr.write(f"push failed; pulling and retrying once:\n{r.stderr}\n")
        _git("pull", "--rebase", "--autostash", check=False)
        r = _git("push", "origin", "HEAD", check=False)
        if r.returncode != 0:
            sys.stderr.write(f"push retry failed:\n{r.stderr}\nAborting.\n")
            sys.exit(1)
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python -m scripts.git_state {pull|commit MESSAGE [PATH ...]}")
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == "pull":
        pull_latest()
        print("ok")
    elif cmd == "commit":
        if len(sys.argv) < 3:
            print("commit requires a message")
            sys.exit(2)
        msg = sys.argv[2]
        paths = sys.argv[3:] or None
        did = commit_and_push(msg, paths)
        print("committed+pushed" if did else "no changes")
    else:
        print(f"unknown command: {cmd}")
        sys.exit(2)
