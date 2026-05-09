# Herb — Search Playbook

## AGENT OUTPUT FORMAT (mandatory)

Agents MUST return a compact pipe-delimited table only — no prose, no headers, no explanations. One row per company. Empty cell = Unknown.

```
Company | Domain | HQ Country | Stage | Raised | Last Round | Investors | Tech (1 line) | Food/Chem sectors | Source URL | Why Now
```

If a source returns nothing: `[source name] | no results`

---

## Search Modes

**Standard** (default): Sources 1–5 + any author files. 2–3 queries per source. Target 60–100 companies pre-dedup.

**Deep** (triggered by "deep search" in activation email): All sources 1–10. 4–5 queries per source. Extended VC list. Target 150–250 companies pre-dedup. Expect 3–5 hours runtime.

Always record which source each company came from.

---

## Source 1 — Crunchbase

Queries (standard: pick 2–3 / deep: run all):
- `site:crunchbase.com "[sector keyword]" Europe "Series A"`
- `site:crunchbase.com "[keyword 1]" "[keyword 2]" startup Europe`
- `crunchbase "[mandate theme]" founded:2019..2024 Series A Europe`
- `site:crunchbase.com "[keyword]" B2B SaaS Europe raised`
- `crunchbase.com "[keyword]" food OR chemical OR industrial Europe startup`

Extract: name, domain, HQ, stage, total raised, last round date + investors, description, employee count, founding year.
Tips: Public profiles accessible via WebFetch. Skip pre-seed and growth-stage.

---

## Source 2 — VC portfolio sites

Queries (standard: pick 2–3 / deep: run all):
- `site:[vcfund.com] portfolio "[mandate keyword]"`
- `"[VC fund name]" portfolio "[sector keyword]" Europe`
- `"[VC fund name]" portfolio site:[vcfund.com]`

**Standard VC list** (always check):
- Planet A Ventures, SET Ventures, World Fund, Extantia Capital, 2150, Kiko Ventures
- EIT Food, EIT InnoEnergy, Pale Blue Dot, Lowercarbon Capital
- Astanor Ventures, Five Seasons Ventures (food/agtech specialists)
- Vsquared Ventures, UVC Partners, High-Tech Gründerfonds (deep tech / industrial)
- Speedinvest, Earlybird, Cherry Ventures (EU generalist with strong industrial/food portfolios)

**Additional — deep mode only:**
- Norrsken VC, Contrarian Ventures, Climentum Capital (Nordics/Baltics)
- Counteract, Carbon Removal Partners, Breakthrough Energy Ventures Europe
- Thrive AgriFood, Acre Venture Partners (food/agtech)
- Voima Ventures, Atlantic Labs, Fly Ventures, Redstone
- Bayern Kapital, HTGF (High-Tech Gründerfonds), Unternehmertum Venture Capital
- Sofinnova Partners, Ctrl+Alt, Clean Energy Ventures
- EQT Ventures, Northzone, Creandum (Nordics generalist)

**VC Roster** (always available in both modes):
Load `references/vc-roster.xlsx` (VCs sheet). Contains 87 VCs tagged as "YES" (core fit) or "MAYBE" (generalist deep tech with some relevant exposure) across Germany, UK, France. For each VC in the roster: fetch portfolio page → extract company names/links → fetch each company site for full profile. Add source = "VC Roster: [VC name]" for all rows from this source.

Fetch portfolio pages (all sources) → extract company names/links → fetch each company site for full profile.

---

## Source 3 — X / Twitter

Queries (standard: 2–3 / deep: 4–5):
- `site:x.com "just raised" "[mandate keyword]" Europe 2025`
- `site:x.com "Series A" OR "Series B" "[mandate keyword]" Europe 2025 2026`
- `site:twitter.com "[mandate keyword]" startup funding announcement Europe`
- `"[mandate keyword]" startup raised million Europe 2025 site:x.com`
- `"[keyword 1]" "[keyword 2]" startup raised site:x.com 2024 2025`

Extract: company name, funding amount + round, investors, tweet date (= why now signal), founder handle.
Focus on tweets from founders, investors, tech journalists. Prioritize last 12 months.

---

## Source 4 — LinkedIn companies

Queries (standard: 2–3 / deep: 4–5):
- `site:linkedin.com/company "[mandate keyword]" Europe`
- `site:linkedin.com/company "[keyword 1]" "[keyword 2]" startup`
- `"[mandate keyword]" B2B startup Europe site:linkedin.com/company`
- `site:linkedin.com/company "[keyword]" food OR chemical OR industrial`
- `"[mandate keyword]" Series A Europe site:linkedin.com/company 2023 2024`

For each company found, also run:
- `site:linkedin.com/in "[company name]" CEO OR founder` — find key contact

Extract: LinkedIn URL, description snippet, employee count, key person name + title + URL.

---

## Source 5 — Conference and competition sites

Queries (standard: 2–3 / deep: 4–5):
- `"[mandate keyword]" winner OR finalist competition Europe 2024 2025`
- `EIC Accelerator "[mandate keyword]" 2024 2025`
- `hello tomorrow "[mandate keyword]" 2024 2025`
- `"[mandate keyword]" startup challenge winner Europe 2023 2024`
- `"[mandate keyword]" accelerator cohort Europe 2024 2025`

Priority conferences (standard): Hello Tomorrow, EIC Accelerator, Bits & Pretzels, AgriFood Innovation, Greentech Festival
Additional (deep mode): Nova-Institute bioeconomy awards, EFIB, Impact Festival, Sifted Summit, Slush, Web Summit (filter by sector), F&A Next, Future Food-Tech

Extract: company name + website, award/recognition (= strong why now signal).

---

## Source 6 — EU grant & innovation databases *(deep mode only)*

Queries:
- `site:eic.ec.europa.eu "[mandate keyword]" beneficiary`
- `"EIC Accelerator" "[mandate keyword]" grant 2022 2023 2024`
- `"Horizon Europe" SME "[mandate keyword]" beneficiary Europe`
- `site:cordis.europa.eu "[mandate keyword]" startup`
- `"Innovate UK" "[mandate keyword]" grant 2023 2024`
- `"EXIST" Germany "[mandate keyword]" startup`
- `"BPI France" "[mandate keyword]" portfolio`

Fetch: CORDIS project pages, EIC beneficiary lists, Innovate UK award announcements.
Note: EU grant = strong quality signal and often pre-Series A — flag as "why now: EU grant recipient".

---

## Source 7 — Startup news sites *(deep mode only)*

Fetch and search:
- `site:sifted.eu "[mandate keyword]" startup raised 2024 2025`
- `site:eu-startups.com "[mandate keyword]" funding 2024 2025`
- `site:agfunder.com "[mandate keyword]" Europe 2024 2025`
- `site:foodnavigator.com "[mandate keyword]" startup investment 2024`
- `site:techcrunch.com "[mandate keyword]" Europe startup raised 2024 2025`
- `site:thespoon.tech "[mandate keyword]" startup 2024 2025` *(food-tech)*

Extract: company name, funding round, investors, publication date (= why now).

---

## Source 8 — Accelerator alumni *(deep mode only)*

Queries:
- `site:ycombinator.com/companies "[mandate keyword]" Europe`
- `"Techstars" "[mandate keyword]" Europe cohort 2022 2023 2024`
- `"Station F" "[mandate keyword]" startup Europe`
- `"Startupbootcamp" "[mandate keyword]" food OR agri OR chemical 2022 2023 2024`
- `"IndieBio" "[mandate keyword]" Europe biotech startup`

Extract: company name, domain, cohort year, short description.
YC: filter by European HQ and relevant sector tags.

---

## Source 9 — Check-sites (if provided by author)

Triggered when: author attached check-sites*.xlsx before or at Start.
Processing: read each URL/site from the file → WebFetch or targeted WebSearch per site → extract companies.
Add source = "Author check-site: [URL]" for all rows from this source.

---

## Source 10 — PitchBook export (if provided by author)

Triggered when: author attached pitchbook-*.xlsx.
Processing: read file → map columns to field-spec → add source = "PitchBook (author export)".
Tips: PitchBook data is high quality — prioritize for icos-fit-eval. Flag rows last updated >12 months.

---

## Source 11 — Icos custom list (if provided by author)

Triggered when: author attached list-*.xlsx.
Processing: read file → fill missing fields via web research → add source = "Icos list (author provided)".

---

## Cross-source deduplication

1. Group by domain (primary key)
2. Fuzzy-match by name >85% where domain missing = same company
3. Keep most complete record; merge source tags
4. Result: one row per unique company

---

## Pipedrive cross-check

For every unique company:
- Call `mcp__plugin_dropin-pipedrive_dropin-pipedrive__lookup_existing`
- Extract ONLY: {status, lost_reason, local_lost_date, org_name}
- Status: New / Open deal — [stage] / Won / Lost — [date]
- Open/Won/Lost: keep on longlist, grey out, skip icos-fit-eval

---

## Search volume targets

| Mode | Round 1 pre-dedup | After dedup + Pipedrive |
|---|---|---|
| Standard | 60–100 | 30–50 new |
| Deep | 150–250 | 80–130 new |
| Round 2 (standard) | 40–60 additional | 20–30 new |
| Round 2 (deep) | 80–120 additional | 40–60 new |
| Round 3 (final sweep) | 20–40 additional | 10–20 new |

If a source returns less than expected: note in run-state.md and flag to author in T4 email.
