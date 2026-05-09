# Herb — Company Field Specification

Every company Herb finds goes through two levels of data capture.
Level 1 is captured during sourcing for all companies.
Level 2 (full icos-fit-eval) runs only on companies that pass the Level 1 pre-screen.

---

## Level 1 — Captured by Herb for every company

### Identity
| Field | Description | Required |
|---|---|---|
| Company name | Official company name | Yes |
| Website | Full URL (https://...) | Yes |
| Domain | Primary domain, no www, no protocol (e.g. acme.com) | Yes — needed for Pipedrive dedup |
| HQ country | Country of headquarters | Yes |
| HQ city | City if findable | No |
| Founded year | Year of founding | If findable |
| Employee count | Headcount or range (e.g. 11-50) | If findable |
| Employee growth signal | Growing / Stable / Shrinking / Unknown | If findable |

### Contact
| Field | Description | Required |
|---|---|---|
| Key contact name | CEO or founder name | Yes |
| Key contact title | Title (CEO / Co-founder / CTO etc.) | Yes |
| Key contact email | Pattern-guessed — always mark as "guessed" | If findable |
| Key contact LinkedIn | Full LinkedIn profile URL | If findable |
| Company LinkedIn | LinkedIn company page URL | If findable |

### Firmographics for pre-screening
| Field | Description | Values |
|---|---|---|
| Icos sector | Which target sector this fits | Food/Nutrition+ / Specialty Chemicals+ / Advanced Materials+ / Industry AI / CCUS / None |
| Funding stage | Current stage | Pre-seed / Seed / Series A / Series B / Growth / Unknown |
| Total funding raised | EUR or USD amount | Amount + currency, or Unknown |
| Last funding round date | Date of most recent round | YYYY-MM or Unknown |
| Last funding investors | Named lead investors | List or Unknown |
| Revenue signal | Evidence of revenue | >€1M ARR / <€1M / Unknown / Pre-revenue |
| Business model | B2B or B2C | B2B / B2C / Mixed / Unknown |
| Technology (1–2 lines) | What is proprietary | Free text |
| Climate/CO2 claim | Does the company make a measurable climate claim? | Yes (with numbers) / Yes (vague) / No |
| EU HQ or strong EU presence | Passes geography gate? | Yes / No / Partial |

### LP relevance flags (quick pre-screen — not scored)
| Field | Values |
|---|---|
| Nouryon relevance | Yes / Maybe / No |
| Bühler relevance | Yes / Maybe / No |
| FrieslandCampina relevance | Yes / Maybe / No |

### Source tracking
| Field | Description |
|---|---|
| Source(s) | Where Herb found this company (Crunchbase / X / LinkedIn / VC portfolio / Conference / PitchBook / Icos list) |
| Why now signal | Specific recent event that makes this timely (with date) |
| Date found | YYYY-MM-DD |

---

## Level 1 pre-screen gate

Run full icos-fit-eval ONLY if ALL of the following are true:
- Icos sector ≠ None
- Funding stage = Series A or B (or Unknown but plausible from context)
- Business model = B2B or Mixed
- At least one LP flag = Yes or Maybe

Companies that fail the pre-screen stay on the long list but are marked
"Pre-screen: Fail — [reason]" and are NOT sent to icos-fit-eval.

---

## Level 2 — Full icos-fit-eval output (shortlisted companies only)

The full scorecard is written to SharePoint by the icos-fit-eval background agent.
Herb reads back the following fields from the saved evaluation file and adds them
to Sheet 2 of the final Excel:

| Field | Source |
|---|---|
| Overall Icos score | icos-fit-eval scorecard |
| Gate result | PROCEED TO DILIGENCE / MONITOR / PASS |
| Nouryon score (1–5) | icos-fit-eval scorecard |
| Bühler score (1–5) | icos-fit-eval scorecard |
| FrieslandCampina score (1–5) | icos-fit-eval scorecard |
| Recommendation summary | 2–3 sentence excerpt from scorecard |
| Critical questions (top 3) | From scorecard |
| Scorecard file link | Path to full .md file on SharePoint |
| Pipedrive status | From icos-fit-eval Pipedrive lookup |

---

## Excel output structure

**Sheet 1 — Long List**
All Level 1 fields above, sorted by: LP relevance (any Yes first) then by Icos sector match.
Column "Icos Fit Run?" = Yes / No / Pending

**Sheet 2 — Icos Fit Results**
Level 2 fields above for companies where full eval was run.
Conditional formatting: green = PROCEED, amber = MONITOR, red = PASS.

**Pipedrive status column (both sheets)**
Values: New / Open deal / Won / Lost (with deal stage and date if known)
Any company with status = Open deal, Won, or Lost is highlighted grey — already in pipeline.
