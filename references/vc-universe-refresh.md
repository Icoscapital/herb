# Refreshing `vc-universe.xlsx` (the PitchBook fund universe)

Herb's source 2 picks ~50 theme-relevant funds per run from this file, then scrapes
their portfolio pages. The file is a **static PitchBook export** — it ages. Herb
emails a reminder when it is older than 6 months (see
`.github/workflows/herb-universe-refresh.yml`).

## PitchBook screener profile (re-run this exact search)

In PitchBook → **Investors** search:

| Criterion | Value |
|---|---|
| Investor type | Venture Capital, Corporate Venture Capital, Accelerator/Incubator, Growth/Expansion |
| Activity | ≥ 1 investment in the last 5 years |
| HQ regions | Europe, United States, Japan (keep "Other" rows PitchBook adds — they don't hurt) |
| Preferred industries (any of) | Agriculture, Chemicals & Gases, Commercial Products, Energy, Food Products, Materials, Software/AI (industrial) |

Current snapshot (2026-06-10): 5,070 funds — EU 1,489 · US 2,221 · JP 196 · Other 1,164.
A refresh returning roughly this magnitude (±30%) is healthy; a much smaller export
means a filter was missed.

## Export format (MUST match — `scripts/vc_filter.py` reads these exactly)

- Excel (.xlsx), single sheet named **`Universe`**
- Columns, in order:
  `Investor | Region | HQ Location | Website | Investments Last 5y | AUM (M) | Preferred Industry | Preferred Verticals | Description`
- Region values: `EU` / `US` / `JP` / `Other` (map PitchBook's region names to these)

## Applying the refresh

```bash
# from repo root
cp ~/Downloads/PitchBook_Investors_Export.xlsx references/vc-universe.xlsx
python -c "import openpyxl; wb=openpyxl.load_workbook('references/vc-universe.xlsx'); \
  ws=wb['Universe']; print('rows:', ws.max_row-1, '| cols:', [c.value for c in ws[1]])"
# sanity: rows ~5000, columns match the list above, sheet is named Universe
git add references/vc-universe.xlsx
git commit -m "chore: refresh PitchBook VC universe ($(date +%Y-%m-%d))"
git push
```

The freshness check keys off this file's last commit date, so committing the refresh
automatically silences the reminder for the next 6 months.
