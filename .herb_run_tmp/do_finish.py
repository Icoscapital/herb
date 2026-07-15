import json
companies = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/companies_final.json'))
from scripts.run_web_mandate import finish_run

ctx = {
    'run_id': 'c086d3c8-f011-4aea-9ddd-3f29bef374d0',
    'theme': 'Technology to help realize continuous fermentation for industrial biotech companies',
    'geography': 'Global',
    'stage': 'Series A, Series B',
    'search_mode': 'DEEP',
    'special_instructions': '',
    'submitted_by_email': 'nlal@icoscapital.com',
    'submitted_by_name': 'Nityen Lal | Icos Capital',
    'additional_companies': [],
    'extra_check_sites': [],
    'icos_fit': True,
    'seed_companies': ['pow.bio', 'moa good tech'],
    'slug': '2026-07-15-technology-to-help-realize-con',
    'current_round': 1,
    'watch': False,
    't_start': 1784128303.6129003,
}

summary = (
    "Recall: 2/2 known companies found by the search (pow.bio and MOA Foodtech both surfaced "
    "independently via Pipedrive CRM).\n\n"
    "Pipedrive cross-check: 145 of 240 candidates were already in our CRM (mostly prior Lost/Open "
    "deals) — expected given Icos's deep prior activity in fermentation/industrial biotech."
)

finish_run(ctx, companies, summary)
print("FINISH_RUN COMPLETE")
