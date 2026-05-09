# Handoff — herb cloud migration

This doc lets a fresh Claude session pick up where the migration left off.

## Decision log (locked in)

- **Storage**: Option C — run state, intake files, longlists, scorecards all live in this repo under `runs/[slug]/`. Each tick: pull latest → run logic → commit any changes → push. **NO** SharePoint/OneDrive Graph access (avoided to skip an Azure admin permission grant).
- **Pipedrive**: inline REST via `scripts/pipedrive_client.py`. NO HTTP MCP, NO Railway.
- **Mailbox (Graph)**: same Azure app as today. Permissions `Mail.Send` + `Mail.ReadWrite` only.
- **Cron**: `0 * * * *` UTC (hourly). Down from 30 min on the laptop — accepted as a minor regression vs team comms ("every 30 min" → "every hour").
- **Skipped**: `outlook_sender.py` (the dropin-pipedrive duplicate-handling tool that uses pywin32 + Outlook COM). Not used by the herb flow today; defer the Graph rewrite until needed.

## Required env vars on the routine

The schedule skill's job_config doesn't have a native env var slot. Two options:

1. **Embed in the prompt itself** (private to authorized routine viewers — fine for a single-team use case).
2. Use the prompt to `Bash export ...` from a secrets file committed to the repo (worse — secrets in git history).

Pick option 1. Required:

```
GRAPH_TENANT_ID=4a638930-1aec-4273-af14-6115c2022bdb
GRAPH_CLIENT_ID=ec685636-cd5a-44b1-9a4f-889a64be7f93
GRAPH_CLIENT_SECRET=pks8Q~~lhGaXQx94Lafn9rWrC7shCEJfsZVi2drV
HERB_MAILBOX=herb@icoscapital.com

PIPEDRIVE_TOKEN=4390e394dc7974a3c32766c7cc7b8bac2b47a424
PIPEDRIVE_DOMAIN=icoscapital
USER_PIPEDRIVE_ID=5523
USER_INVESTMENT_MANAGER_OPTION_ID=423
DEFAULT_PIPELINE_ID=9
DEFAULT_STAGE_ID=141

GIT_COMMIT_NAME=herb-bot
GIT_COMMIT_EMAIL=herb@icoscapital.com
```

These are the same values as `~/.dropin-pipedrive/config.json` and `~/IcosCapital/.../herb/config/herb-credentials.json`.

## What's done in this repo

- ✅ `README.md` — architecture overview
- ✅ `.gitignore`, `requirements.txt`
- ✅ `references/email-templates.md`, `search-playbook.md`, `field-spec.md` (verbatim copies from local)
- ✅ `scripts/pipedrive_client.py`, `schema_constants.py` (lifted from dropin-pipedrive)
- ✅ `scripts/git_state.py` — pull/commit/push helpers
- ✅ `scripts/email_check.py` — mailbox poll, env-var-based auth
- ✅ `scripts/email_send.py` — T1–T8 sender, env-var-based auth
- ✅ `scripts/run_state.py` — read/write run-state.md as repo files

## What's left to build

### 1. `scripts/longlist_builder.py` (~250 lines)

Port from today's manual run scripts:
- `~/.dropin-pipedrive/_build_v2.py` — v1→v2 merger with Comp Focus column
- `~/.dropin-pipedrive/_finalize_run.py` — Sheet 2 builder + final docx (already deleted; reference today's run output structure: `~/IcosCapital/.../herb/runs/2026-05-07-enzyme-design/final-longlist-enzyme-design.xlsx` and `final-summary-enzyme-design.docx`)

Functions to expose:
- `build_longlist_v1(slug, rows: list[dict]) -> Path` — Sheet 1 with all field-spec.md columns, Sheet 2 placeholder
- `build_longlist_vN(slug, n: int, base_v: int, new_rows: list[dict]) -> Path` — preserve prior row order, append new
- `tag_comp_focus(rows) -> rows` — adds HIGH/MED/LOW from tech-line keyword matching (algorithm in `_build_v2.py`)
- `build_final_longlist(slug, scorecards: list[dict]) -> Path` — populate Sheet 2 with parsed scorecards
- `build_final_summary_docx(slug, summary_data: dict) -> Path` — cover, top picks, methodology

Each should commit its output via `git_state.commit_and_push` so the team sees results immediately.

### 2. `routine_prompt.md` (~300 lines, the "brain")

The full prompt registered with the schedule skill. Encodes the herb protocol entirely. Must be self-contained because each routine tick is a fresh sandbox.

Structure (use the local SKILL.md at `~/.claude/scheduled-tasks/herb-email-poller/SKILL.md` as the seed, adapt for cloud):

```markdown
You are Herb, Icos Capital sourcing agent. Hourly cloud-hosted poll.

## Setup (run once at start of every tick)
export GRAPH_TENANT_ID=...
export GRAPH_CLIENT_ID=...
[etc.]
python -m scripts.git_state pull

## 1 — Check inbox
python -m scripts.email_check
Empty → STOP.

## 2 — Route each email
[Activation, Start, Score, Attachment, Feedback, Pipedrive approval, Learning — same routing as local SKILL.md]

## 3 — Commit + push state changes
python -m scripts.git_state commit "tick: [summary]"

## TOKEN RULES
[same as local SKILL.md — search agents must return pipe-delimited table only, etc.]

## References
- references/email-templates.md
- references/search-playbook.md
- references/field-spec.md
```

⚠ Important: routine sandboxes by default have allowed_tools = [Bash, Read, Write, Edit, Glob, Grep]. To spawn parallel search agents and parallel icos-fit-evals (Phase 2 / Phase 5), add `Task` to the allowed_tools list when calling `RemoteTrigger create`. If the runtime doesn't support sub-agents inside routines, fall back to serial execution (slower but simpler).

### 3. Local end-to-end test

Before registering the routine:

```bash
cd /path/to/herb
pip install -r requirements.txt
export GRAPH_TENANT_ID=... [etc.]
git pull
python -m scripts.email_check          # should list current unread
python -m scripts.email_send <you>     # should send a test email
python -c "from scripts import run_state; print(run_state.list_active())"
```

Once those pass, simulate one tick by running the routine_prompt.md instructions manually in Claude Code from the repo root — verify it pulls, processes, commits, pushes correctly.

### 4. Register the routine via the schedule skill

```
/schedule
```

Settings:
- Cron: `0 * * * *` (hourly UTC — minimum allowed by Routines)
- Repo: `https://github.com/Icoscapital/herb`
- Model: `claude-sonnet-4-6`
- Allowed tools: `Bash, Read, Write, Edit, Glob, Grep, Task` (add Task for sub-agents)
- Prompt: contents of `routine_prompt.md`

### 5. Smoke test the live routine

Send a test "Hello Herb, let's go fetch — test mandate" from your @icoscapital.com address. Wait ≤1 hour. Verify:
- T2 mandate confirmation email arrives
- `runs/[date]-test-slug/run-state.md` appears in the repo
- `poll-log.txt` gets a new line

## Reference: today's manual run (as the test case)

Today (2026-05-09) we drove the enzyme-design run end-to-end manually and it works. All artifacts at:
- `~/IcosCapital/ICOS-New Deals - Documenten/claude-stuff-donot-touch/herb/runs/2026-05-07-enzyme-design/`
  - `run-state.md`, `longlist-v1.xlsx`, `longlist-v2.xlsx`, `final-longlist-enzyme-design.xlsx`, `final-summary-enzyme-design.docx`
- `~/IcosCapital/.../icos-fit-eval/evaluations/*-2026-05-09.md` (10 scorecards)

The cloud version should reproduce that workflow given the same activation email + intake files.

## Known issues to fix during the build

1. **`pipedrive_client.lookup_existing` missed 3 Lost deals today** (Cambrium, Enzymit, Innophore — all tagged "New" by Round 1 despite being Lost). Investigate the matching heuristic — possibly fuzzy-name matching dominates over exact-domain, masking domain-exact Lost matches. Add a domain-first lookup path before falling back to fuzzy.

2. **Sub-agent parallelism inside routines is unverified.** Test before relying on it for Phase 2 (6 search agents) and Phase 5 (10–15 icos-fit-eval agents). If unsupported, choose between (a) serial execution (slower; ticks may exceed cron interval, fine since hourly) or (b) splitting into multiple routines that pass state through git.

## Final checklist for the build session

- [ ] `scripts/longlist_builder.py` written + tested against today's enzyme-design run output
- [ ] `routine_prompt.md` written
- [ ] Local end-to-end test passes
- [ ] Routine registered
- [ ] Test "Hello Herb" smoke test passes
- [ ] Update README to remove the "still to build" note
- [ ] Delete this HANDOFF.md (or move to a `docs/migration-history.md`)
