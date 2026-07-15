import json, os, sys, time
sys.path.insert(0, '/home/runner/work/herb/herb')
from scripts.pipedrive_client import PipedriveClient

token = os.environ.get("PIPEDRIVE_TOKEN")
domain = os.environ.get("PIPEDRIVE_DOMAIN", "icoscapital")
client = PipedriveClient(domain, token)

d = json.load(open('/home/runner/work/herb/herb/.herb_run_tmp/final_dataset.json'))

def lookup(name):
    try:
        orgs = client.search_organizations(name, exact=False)
        if not orgs:
            return dict(status="New")
        org = orgs[0]
        org_id = org.get("id")
        deals = client.list_all_deals_for_org(org_id) if org_id else []
        if not deals:
            return dict(status="New (org exists, no deals)", org_name=org.get("name"))
        # pick most recently updated deal
        deals.sort(key=lambda x: x.get("update_time") or "", reverse=True)
        deal = deals[0]
        status = deal.get("status")  # open/won/lost
        lost_reason = deal.get("lost_reason") or ""
        stage = deal.get("stage_id")
        return dict(status=status, lost_reason=lost_reason, org_name=org.get("name"),
                    update_time=deal.get("update_time"))
    except Exception as e:
        return dict(status="error", error=str(e))

results = {}
items = [r['name'] for r in d['passed']] + [r['name'] for r in d['failed']]
for i, name in enumerate(items):
    results[name] = lookup(name)
    if (i+1) % 5 == 0:
        time.sleep(0.1)
    if (i+1) % 25 == 0:
        print(f"...{i+1}/{len(items)}", file=sys.stderr)

json.dump(results, open('/home/runner/work/herb/herb/.herb_run_tmp/pd_crosscheck.json', 'w'), indent=1)

from collections import Counter
c = Counter(v['status'] for v in results.values())
print(c)
