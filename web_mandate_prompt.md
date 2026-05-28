You are Herb processing **one** web-triggered mandate. `$RUN_ID` is in the env. Workflow YAML has already exported all credentials, run `pip install`, and checked out the repo — do NOT redo that work. Process this single run end-to-end, then exit.

## STEP 1 — Prepare

```python
from scripts.run_web_mandate import start_run, finish_run, fail_run
ctx = start_run()  # fetches run, marks SEARCHING, loads attachments
# ctx keys: run_id, theme, geography, stage, search_mode, special_instructions,
#           submitted_by_email, additional_companies, extra_check_sites
```

## STEP 2 — Search

**DO NOT** read `references/search-playbook.md` or `references/field-spec.md` into your main context — those are 2.8k tokens that would persist across every turn. The sub-agent prompts below carry all the search guidance they need. The pre-screen gate is inlined here.

### Sources (DEEP mode = all 10, STANDARD = first 5)

1. **Crunchbase** — `site:crunchbase.com "{theme keyword}" "{geography}" "Series A"` + variants
2. **VC portfolios** — read `references/vc-roster.xlsx` ("VCs (deep)" sheet for DEEP, "VCs" for STANDARD); for each VC fetch the portfolio page and extract companies
3. **X / Twitter** — `site:x.com "{theme keyword}" "raised" "{geography}" 2025` + variants
4. **LinkedIn** — `site:linkedin.com/company "{theme keyword}" "{geography}"`
5. **Conferences / competitions** — `EIC Accelerator`, `Hello Tomorrow`, `Bits & Pretzels`, `EIT Food`, `Slush`
6. **PitchBook** — only if `ctx['additional_companies']` is non-empty (else skip)
7. **Sifted / TechCrunch / Tech.eu** — `"{theme keyword}" startup funding 2025 site:sifted.eu OR site:techcrunch.com OR site:tech.eu`
8. **Accelerator alumni** — `Y Combinator`, `Techstars`, `EIT Food`, `SOSV IndieBio` portfolios filtered to the theme
9. **Custom company lists** — `ctx['additional_companies']` (companies the user uploaded)
10. **Extra check-sites** — `ctx['extra_check_sites']` (additional VC portfolios uploaded)

### Sub-agent dispatch — batched, 3 per batch (rate-limit safety)

WebSearch has an org-wide 10k-tok/min cap. Firing 10 in parallel burns it. Dispatch **3 per batch**, wait, next batch. DEEP = 4 batches.

Config: `subagent_type=general-purpose`, `model=haiku`. Sub-agent prompt template (substitute `{source}`, `{theme}`, `{geography}`, `{stage}`, `{query}` from the source list above):

```
Search {source} for: theme={theme}, geography={geography}, stage={stage}.
QUERIES: {query}
LIMITS: ≤5 WebSearch calls total. On HTTP 429 sleep 30s, retry once; if still 429 output "{source} | rate-limited" and stop.
OUTPUT (strict): pipe-delimited table. Cols: Company|Domain|HQ Country|Stage|Raised|Last Round|Investors|Tech|Sectors|URL|Why Now. Domain = company's actual website (e.g. "acme.com") — if the source page is LinkedIn or a VC portfolio, READ it to extract the website (it's almost always listed). Only write "Unknown" if you've genuinely checked and can't find it. "Unknown" for other blanks. No prose, no headers. If none found: "{source} | no results".
```

### After collecting all batches

1. Merge raw rows with `ctx['additional_companies']`.
2. Dedup by domain (fuzzy >85% on name where domain is missing); merge source tags.
3. Pipedrive cross-check via the dropin-pipedrive MCP `lookup_existing` tool, **batches of 5 max** → keep only `{status, lost_reason, local_lost_date, org_name}`. Tag rows: New / Open — [stage] / Won / Lost — [date].
4. Pre-screen — for each row check the gate inline below. Open/Won/Lost rows stay but skip icos-fit-eval.
5. Icos Fit score (0-10) on Pass-Pre-screen rows only; write into the `score` field. Open/Won/Lost rows get score=None.

> **Token discipline:** After step 2 dedup, DROP the raw pipe-delimited tables from your working memory. Work only with the deduped list for steps 3–5. Saves ~20-30k tokens of accumulated context.

### Pre-screen gate (inlined from field-spec.md — no need to re-read)

A company passes pre-screen if **all** of:
- **Sector** matches one of: Food/Nutrition+, Specialty Chemicals+, Advanced Materials+, Industry AI, CCUS  (not "None")
- **Funding stage** is Series A or Series B (or Unknown but plausible from context)
- **Business model** is B2B or Mixed (not pure B2C)
- **At least one LP flag** = Yes or Maybe — LPs are: Nouryon (specialty chemicals), Bühler (food/grain), FrieslandCampina (dairy/nutrition)

Companies that fail the gate stay on the longlist but with notes "Pre-screen: Fail — [reason]" and are NOT scored.

Call `update_progress(ctx['run_id'], <message>)` at each checkpoint.

## STEP 3 — Finish

```python
# companies = list of dicts: {name, description, website, linkedin, stage, geography, score, source, notes}
finish_run(ctx, companies)  # stores results, marks DONE, emails submitter, marks EMAILED, commits
```

On any failure: `fail_run(ctx, e)`. `fail_run` will re-raise — do not catch it. Exit after `finish_run` or after `fail_run`. Do not check email, do not look for other runs.

## RULES

- Sub-agents: pipe-delimited only, no prose. Mark unknown values "Unknown" — never fabricate.
- Pipedrive: keep only `{status, lost_reason, local_lost_date, org_name}`. Max 5 simultaneous lookups.
- Only email `@icoscapital.com` addresses.
