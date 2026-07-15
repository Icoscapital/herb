import json, re, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from raw_rows import PIPEDRIVE, U

data = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/merged_web.json'))

# Known-domain overrides for well-known companies (high confidence, own primary site)
KNOWN_DOMAINS = {
    'vivici': 'vivici.com',  # confirmed via Non-English EU source
    'formo': 'formo.bio',
    'ginkgobioworks': 'ginkgobioworks.com',
    'mycoworks': 'mycoworks.com',
    'perfectday': 'perfectday.com',
    'impossiblefoods': 'impossiblefoods.com',  # already has
    'shiru': 'shiru.com',
    'novameat': 'novameat.com',
    'brightseed': 'brightseedbio.com',
    'avantium': 'avantium.com',
    'biotalys': 'biotalys.com',
    'mosameat': 'mosameat.com',
    'enko': 'enkochem.com',
}

# Business model classification: flag pure-B2C consumer brands (fail pre-screen)
B2C_NAMES = {
    'impossiblefoods', 'ripplefoods', 'v2food', 'swap', 'clevelandkitchen',
    'flyingembers', 'sanafoods', 'joywell', 'bligrove', 'balgrove', 'baligrove',
}

# Sectors that satisfy the mandate's sector gate (Food/Nutrition+, Specialty Chemicals+,
# Advanced Materials+, Industry AI, CCUS) — our collected "sectors"/"tech" fields already
# bucket most rows; treat bioprocessing/synbio/industrial-biotech tooling as on-thesis
# (they ARE "technology to help realize continuous fermentation").
OFFTHESIS_KEYWORDS = ['pharma', 'therapeutic', 'gene therap', 'cell and gene therapy',
                      'antibody', 'crop protection seed breeding only']

def norm(n):
    n = n.lower().strip()
    n = re.sub(r'[^a-z0-9]+', '', n)
    return n

rows = []
for d in data:
    key = norm(d['name'])
    if not d['domain'] and key in KNOWN_DOMAINS:
        d['domain'] = KNOWN_DOMAINS[key]
    d['source_tag'] = ', '.join(d['sources'])
    rows.append(d)

for p in PIPEDRIVE:
    rows.append(dict(name=p['name'], domain=p['domain'] or None, hq=U, fte=U, stage=U, raised=U,
                      last_round=U, investors=[], tech=p['desc'], sectors=U, why_now=U,
                      sources=['Pipedrive CRM'], source_tag='Pipedrive CRM',
                      pd_status=p['status'], pd_reason=p['reason'], pd_stage=p['pd_stage'], pd_updated=p['updated']))

print(f"Total rows to pre-screen: {len(rows)}")

passed, failed, pd_skip = [], [], []
for r in rows:
    if r['source_tag'] == 'Pipedrive CRM' or 'Pipedrive CRM' in r.get('sources', []):
        pd_skip.append(r)
        continue
    key = norm(r['name'])
    text = f"{r.get('tech','')} {r.get('sectors','')}".lower()
    if key in B2C_NAMES:
        r['prescreen'] = 'Fail — pure B2C consumer brand'
        failed.append(r)
        continue
    ontheme_rescue = any(k in text for k in ['food', 'industrial', 'biofuel', 'material', 'chemical', 'ferment'])
    if any(k in text for k in OFFTHESIS_KEYWORDS) and not ontheme_rescue:
        r['prescreen'] = 'Fail — pharma/therapeutics-only, no industrial/food application'
        failed.append(r)
        continue
    r['prescreen'] = 'Pass'
    passed.append(r)

print(f"Pass: {len(passed)}, Fail: {len(failed)}, Pipedrive (skip scoring): {len(pd_skip)}")
print("\nFailed rows:")
for r in failed:
    print(' -', r['name'], '|', r['prescreen'])

json.dump(dict(passed=passed, failed=failed, pd_skip=pd_skip), open('/home/runner/work/herb/herb/.herb_run_tmp/prescreened.json','w'), indent=1)
