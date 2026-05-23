"""Git helpers with timeouts for routine sandbox."""
from __future__ import annotations
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
COMMIT_NAME = os.environ.get("GIT_COMMIT_NAME", "herb-bot")
COMMIT_EMAIL = os.environ.get("GIT_COMMIT_EMAIL", "herb@icoscapital.com")

# Timeouts (seconds) - prevent hanging on network issues
GIT_TIMEOUT = 30  # 30s for pull/push
COMMIT_TIMEOUT = 10  # 10s for commit


def _git(*args: str, check: bool = True, timeout: int = GIT_TIMEOUT) -> subprocess.CompletedProcess:
    """Run git command with timeout."""
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=check,
        timeout=timeout,
    )


def ensure_identity() -> None:
    """Idempotent — sets user.name/email if not already set."""
    try:
        n = _git("config", "user.name", check=False, timeout=5).stdout.strip()
        if not n:
            _git("config", "user.name", COMMIT_NAME, timeout=5)
        e = _git("config", "user.email", check=False, timeout=5).stdout.strip()
        if not e:
            _git("config", "user.email", COMMIT_EMAIL, timeout=5)
    except subprocess.TimeoutExpired:
        sys.stderr.write("WARNING: git config timeout\n")


def pull_latest() -> None:
    """Fast-forward pull with timeout."""
    ensure_identity()
    try:
        r = _git("pull", "--ff-only", check=False, timeout=GIT_TIMEOUT)
        if r.returncode != 0:
            sys.stderr.write(f"git pull --ff-only failed:\n{r.stderr}\n")
            sys.stderr.write("Aborting — investigate before next tick.\n")
            sys.exit(1)
    except subprocess.TimeoutExpired:
        sys.stderr.write("ERROR: git pull timed out (hung for >{}s)\n".format(GIT_TIMEOUT))
        sys.exit(1)


def commit_and_push(message: str, paths: list[str] | None = None) -> bool:
    """Stage, commit, push with timeouts."""
    ensure_identity()
    try:
        if paths:
            _git("add", *paths, timeout=10)
        else:
            _git("add", "-A", timeout=10)

        # Check if anything to commit
        r = _git("diff", "--cached", "--name-only", check=False, timeout=10)
        if not r.stdout.strip():
            return False

        _git("commit", "-m", message, timeout=COMMIT_TIMEOUT)

        # Push with retry
        r = _git("push", "origin", "HEAD", check=False, timeout=GIT_TIMEOUT)
        if r.returncode != 0:
            sys.stderr.write(f"push failed; pulling and retrying once:\n{r.stderr}\n")
            _git("pull", "--rebase", "--autostash", check=False, timeout=GIT_TIMEOUT)
            r = _git("push", "origin", "HEAD", check=False, timeout=GIT_TIMEOUT)
            if r.returncode != 0:
                sys.stderr.write(f"push retry failed:\n{r.stderr}\nAborting.\n")
                sys.exit(1)
        return True
    except subprocess.TimeoutExpired as e:
        sys.stderr.write(f"ERROR: git operation timed out: {e}\n")
        sys.exit(1)


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
