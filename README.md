# herb — Icos Capital sourcing agent

Cloud-hosted version of Herb. Runs as an [Anthropic Routine](https://claude.ai/code/routines) on an hourly cron, polls `herb@icoscapital.com`, and drives the full sourcing protocol (mandate confirm → search → longlist → Icos Fit → final report → Pipedrive entry).

## Architecture

| Concern | How it's handled |
|---|---|
| **Execution** | Anthropic Routine — fresh sandbox per tick, clones this repo |
| **Mailbox** | Microsoft Graph API (herb@icoscapital.com) — see `scripts/email_check.py` / `email_send.py` |
| **Run state + intake files + longlists** | Committed to this repo under `runs/[slug]/`. Each tick pulls latest, runs logic, commits any changes, pushes. Team browses via github.com/Icoscapital/herb/tree/main/runs. (We chose this over SharePoint/OneDrive to avoid an Azure admin permission grant.) |
| **Pipedrive** | Inline REST via `scripts/pipedrive_client.py` (no MCP server, no Railway) |
| **Cron** | `0 * * * *` UTC — every hour on the hour |
| **Credentials** | Embedded in the routine prompt (private to authorized routine viewers) |

## Layout

```
herb/
├── routine_prompt.md          # The full prompt registered with the schedule skill
├── requirements.txt
├── scripts/
│   ├── graph_io.py            # OneDrive read/write via Microsoft Graph
│   ├── run_state.py           # run-state.md read/update via graph_io
│   ├── email_check.py         # mailbox poll
│   ├── email_send.py          # T1–T8 sender
│   ├── pipedrive_client.py    # standalone REST wrapper
│   ├── schema_constants.py    # Pipedrive field IDs / option IDs
│   ├── longlist_builder.py    # Excel + docx builder (Phase 4 + 5 outputs)
│   └── herb_run.py            # orchestrator — main entry point the routine calls
├── references/
│   ├── email-templates.md     # T1–T8
│   ├── search-playbook.md     # per-source query patterns
│   └── field-spec.md          # Level 1 + Level 2 field definitions
└── runs/                       # state lives here, committed each tick
    └── [YYYY-MM-DD-slug]/
        ├── run-state.md
        ├── intake/             # author-attached PitchBook/Pipedrive/list/check-sites files
        ├── longlist-v1.xlsx
        ├── longlist-v2.xlsx
        ├── final-longlist-[slug].xlsx
        ├── final-summary-[slug].docx
        └── evals/              # icos-fit-eval scorecards, [Company]-YYYY-MM-DD.md
```

## Running locally (for testing)

```bash
pip install -r requirements.txt
export GRAPH_TENANT_ID=...
export GRAPH_CLIENT_ID=...
export GRAPH_CLIENT_SECRET=...
export PIPEDRIVE_TOKEN=...
export PIPEDRIVE_DOMAIN=icoscapital
export USER_PIPEDRIVE_ID=5523
export USER_IM_OPTION=423
python -m scripts.herb_run
```

## Routine

Registered via the `schedule` skill. Cron: `0 * * * *` UTC. Prompt source: `routine_prompt.md`.

To pause: disable via https://claude.ai/code/routines.

## Migration history

Migrated from local cron-on-laptop setup on 2026-05-09 after the laptop-bound version proved unreliable (zombie sessions on permission prompts). See `~/IcosCapital/.../claude-stuff-donot-touch/herb/runs/` for prior run history.

