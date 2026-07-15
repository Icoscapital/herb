import json, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from raw_rows import PIPEDRIVE

d = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/final_dataset.json'))
pd_x = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/pd_crosscheck.json'))

def domain_or_none(x):
    return x if x else None

all_rows = []

# 1. Pipedrive-sourced rows (40) — skip icos-fit scoring, notes = Pipedrive tag
for p in PIPEDRIVE:
    if p['status'] == 'lost':
        tag = f"Pipedrive: Lost — {p['reason']}" if p['reason'] else "Pipedrive: Lost"
    elif p['status'] == 'won':
        tag = "Pipedrive: Won"
    else:
        tag = f"Pipedrive: Open — {p['pd_stage']}" if p['pd_stage'] else "Pipedrive: Open"
    all_rows.append(dict(
        name=p['name'], domain=domain_or_none(p['domain']), hq=None, fte=None, stage=None,
        raised=None, tech=p['desc'], sectors=None, why_now=None,
        source="Pipedrive CRM", prescreen="Skip (Pipedrive)", pd_tag=tag,
        needs_scoring=False,
    ))

# 2. Web-sourced rows — apply cross-check
for bucket, prescreen_label in [('passed', 'Pass'), ('failed', None)]:
    for r in d[bucket]:
        px = pd_x.get(r['name'], {})
        status = px.get('status', 'New')
        if status in ('lost', 'open', 'won'):
            if status == 'lost':
                reason = px.get('lost_reason') or ''
                tag = f"Pipedrive: Lost — {reason}" if reason else "Pipedrive: Lost"
            elif status == 'won':
                tag = "Pipedrive: Won"
            else:
                tag = "Pipedrive: Open"
            needs_scoring = False
            prescreen_final = f"Skip (Pipedrive: {status})"
        else:
            tag = None
            prescreen_final = r.get('prescreen', prescreen_label or 'Fail')
            needs_scoring = prescreen_final == 'Pass'
        all_rows.append(dict(
            name=r['name'], domain=domain_or_none(r.get('domain')), hq=r.get('hq'),
            fte=r.get('fte'), stage=r.get('stage'), raised=r.get('raised'),
            tech=r.get('tech'), sectors=r.get('sectors'), why_now=r.get('why_now'),
            source=r.get('source_tag') or ', '.join(r.get('sources', [])),
            prescreen=prescreen_final, pd_tag=tag, needs_scoring=needs_scoring,
        ))

json.dump(all_rows, open('/home/runner/work/herb/herb/.herb_run_tmp/all_rows.json', 'w'), indent=1)

to_score = [r for r in all_rows if r['needs_scoring']]
skip_pd = [r for r in all_rows if r.get('pd_tag')]
prescreen_fail = [r for r in all_rows if not r['needs_scoring'] and not r.get('pd_tag') and r['prescreen'] != 'Skip (Pipedrive)']

print(f"Total rows: {len(all_rows)}")
print(f"To score (Pass prescreen + not in CRM already): {len(to_score)}")
print(f"Skip scoring — already in Pipedrive CRM: {len(skip_pd)}")
print(f"Skip scoring — failed prescreen: {len(prescreen_fail)}")
