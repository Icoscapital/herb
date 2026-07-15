import json, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from domain_resolutions import RESOLVED

d = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/prescreened.json'))

for bucket in ('passed', 'failed'):
    for r in d[bucket]:
        if not r.get('domain') and r['name'] in RESOLVED and RESOLVED[r['name']]:
            r['domain'] = RESOLVED[r['name']]

still_missing = [r['name'] for r in d['passed'] if not r.get('domain')]
print(f"Pass rows still missing domain after resolution: {len(still_missing)}")
print(still_missing)

json.dump(d, open('/home/runner/work/herb/herb/.herb_run_tmp/final_dataset.json', 'w'), indent=1)
print(f"\nTotal: pass={len(d['passed'])}, failed={len(d['failed'])}, pd_skip={len(d['pd_skip'])}")
