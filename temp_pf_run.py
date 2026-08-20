#!/usr/bin/env python3
from scripts.run_web_mandate import start_run, finish_run, fail_run
from temp_pf_finalize import final

ctx = {
    "run_id": "1ad0cf3c-ebc5-4650-9b40-06026900d158",
    "theme": "Find startups and scale-ups building precision fermentation and microbial biomanufacturing platforms that produce food or specialty ingredients — not pharma or industrial chemicals. Focus on companies engineering microbial strains (bacteria, yeast, fungi) to produce proteins, fats, flavours, colours, or functional ingredients at or below the cost of the incumbent (animal-, plant-, or petrochemical-derived) product. Include companies working on fermentation process optimization, strain engineering, or scale-up/bioprocess infrastructure that supports this.",
    "geography": "Global",
    "stage": "Series A, Series B, Pre-seed, Seed",
    "search_mode": "DEEP",
    "special_instructions": "",
    "submitted_by_email": "ff@icoscapital.com",
    "submitted_by_name": "Fabia Fruck",
    "additional_companies": [],
    "extra_check_sites": [],
    "icos_fit": False,
    "seed_companies": [],
    "exhaustive": False,
    "include_small": False,
    "slug": "2026-08-20-find-startups-and-scale-ups-bu-ju1tpt",
    "current_round": 1,
    "watch": False,
    "t_start": 1787231492.4613256,
}

summary = """Mode: COMPREHENSIVE (DEEP), Regions: EU+JP+US (Global). No seed companies or author-named companies to recall-check against.
Sources run: Herb memory (52 hits), Pipedrive CRM (40 hits), VC-fund discovery (EU/JP/US), ~25 fund-portfolio scrapes (roster VCs-deep + vc_filter universe + newly-discovered CVCs), Crunchbase, open web, X/Twitter, LinkedIn (EU + JP/US), conferences/accelerator alumni, trade media (food/agrifoodtech sector), university tech-transfer, general press, EU grants/CORDIS/EIC Accelerator, non-English EU queries, patent mining (EU/US/JP — yielded nothing usable after Reality Gate).
Patent/grant Reality Gate: 3 EU-grant candidates checked — MOA FOODTECH and NoPalm Ingredients verified REAL (funded, staffed, named commercial pilots); Esencia Foods dropped (Verdict=UNCLEAR, no FTE/traction evidence); "Bioalbumen" turned out to be a product line of Onego Bio, merged into that row rather than listed separately.
Mandate fit: excluded 32 raw hits as pharma-only, industrial-chemicals-only, plant/algae-cell (non-microbial) tech, cultivated-meat cells, VC funds mistakenly surfaced as companies, or companies well beyond Series B (public/established/late-stage) — see notes on individual excluded-adjacent rows still worth knowing about only where explicitly noted.
Pre-screen: 129 companies on the longlist; 7 flagged Pre-screen Fail (stage out of range — Growth/established — or B2C business model) and kept for visibility but not scored.
Icos Fit scoring was not requested for this run (icos_fit=false) — all rows have score=None; scoring can be triggered later from the results page.
Segments (market map): Bioprocess & scale-up infrastructure (20), Microbial protein & biomanufacturing platforms (17), Strain engineering & synbio platforms (16), Dairy & egg proteins (15), Flavors & functional ingredients (14), Alt meat & mycoprotein (12), Alt fats & oils (7), Algae-based ingredients — adjacent, not bacteria/yeast/fungi (5), Colors & pigments (5), Other/Unclassified (18).
Budget note: stopped further fund-portfolio expansion after ~25 funds scraped (of ~85 candidate funds identified) once a strong, well-diversified 129-company longlist was in hand, to guarantee finalization within the turn budget — the un-scraped funds were mostly smaller/generalist deep-tech funds with lower expected fermentation-specific yield."""

companies = final

try:
    finish_run(ctx, companies, summary=summary)
    print("DONE")
except Exception as e:
    fail_run(ctx, e)
