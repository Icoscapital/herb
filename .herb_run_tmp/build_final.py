import json, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from deep_dives import DEEP_DIVES

rows = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/rows_final.json'))

def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    if s.lower() in ('unknown', 'none', ''):
        return None
    return s

companies = []
for r in rows:
    tech = clean(r.get('tech'))
    sectors = clean(r.get('sectors'))
    if tech and sectors:
        description = f"{tech} ({sectors})"
    elif tech:
        description = tech
    else:
        description = sectors or ""

    notes_parts = []
    if r.get('fit_notes'):
        notes_parts.append(r['fit_notes'])
    if r.get('pd_tag'):
        notes_parts.append(r['pd_tag'])
    if not notes_parts and r.get('prescreen') and r['prescreen'] not in ('Pass',):
        notes_parts.append(f"Pre-screen: {r['prescreen']}")
    fte = clean(r.get('fte'))
    if fte:
        notes_parts.insert(0, f"FTE: {fte}")
    notes = ' | '.join(notes_parts) if notes_parts else None

    companies.append(dict(
        name=r['name'],
        description=description,
        website=clean(r.get('domain')),
        linkedin=None,
        stage=clean(r.get('stage')),
        geography=clean(r.get('hq')),
        segment=r.get('segment'),
        score=r.get('score'),
        source=clean(r.get('source')),
        notes=notes,
        deep_dive=DEEP_DIVES.get(r['name']),
    ))

json.dump(companies, open('/home/runner/work/herb/herb/.herb_run_tmp/companies_final.json', 'w'), indent=1)
print(f"Built {len(companies)} companies")
print(f"With score: {sum(1 for c in companies if c['score'] is not None)}")
print(f"With deep_dive: {sum(1 for c in companies if c['deep_dive'])}")
print(f"With website: {sum(1 for c in companies if c['website'])}")
