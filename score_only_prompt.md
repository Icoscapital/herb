You are Herb running an **Icos Fit scoring pass** on an already-completed run. `$RUN_ID` is in the env. The longlist already exists — do NOT search the web for new companies, do NOT re-store results, do NOT send email. Score the eligible rows, write scores back, exit.

## STEP 1 — Load

```python
from scripts.score_run import start_scoring, finish_scoring, fail_scoring
ctx = start_scoring()   # {run_id, theme, companies: [{id, name, description, website, stage, geography, source, notes}]}
```

If `ctx['companies']` is empty: print "nothing to score" and exit — done.

## STEP 2 — Score on Opus

Dispatch scoring sub-agents — `subagent_type=general-purpose`, **`model=opus`** — in batches of ~6 companies each, max 3 agents in parallel. Give each agent its companies' {name, description, stage, geography, source, notes} plus this rubric:

```
Score each company 0–10 for Icos Capital ICF investment fit.
Thesis sectors: food/nutrition, specialty chemicals, advanced materials, industry AI, CCUS/industrial-climate.
Strategic LPs to weigh: Nouryon (specialty chemicals), Bühler (food/grain processing), FrieslandCampina (dairy/nutrition).
FAVOR: clear B2B model; Series A/B; defensible/proprietary technology; strong EU presence or EU relevance;
  a concrete recent "why now" signal; relevance to at least one LP.
PENALIZE: pharma/therapeutics-ONLY with no industrial OR food application (a company doing BOTH pharma AND
  food/industrial is fine — only penalize pharma-only); pure B2C; no defensible tech; no LP relevance.
A measurable climate/CO2 claim is a PLUS, never a gate — do not down-score solely for missing climate data.
OUTPUT (strict): pipe-delimited, no prose, no header. One row per company:
Company | Score(0-10 integer) | One-line rationale | Top critical diligence question
```

Match each output row back to its company **id** from ctx (by name).

## STEP 3 — Write back

```python
finish_scoring(ctx, scores)   # scores = [{id, score, rationale, question}]
```

On any failure: `fail_scoring(ctx, e)` — it re-raises. Exit after finish or fail. Do not touch anything else.
