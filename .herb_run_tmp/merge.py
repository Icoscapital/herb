import re, sys
sys.path.insert(0, '/home/runner/work/herb/herb/.herb_run_tmp')
from raw_rows import PIPEDRIVE, WEB_ROWS, U

def norm_name(n):
    n = n.lower().strip()
    n = re.sub(r'[^a-z0-9]+', '', n)
    n = re.sub(r'^the', '', n)
    n = re.sub(r'(inc|llc|ltd|gmbh|kk|co|corp|bio|biosciences|biotech|foods|foodtech)$', '', n)
    return n

def norm_domain(d):
    if not d or d == U:
        return None
    d = d.lower().strip()
    d = re.sub(r'^https?://', '', d)
    d = re.sub(r'^www\.', '', d)
    d = d.split('/')[0]
    return d

# Merge WEB_ROWS by normalized name (many companies mentioned across multiple sources)
merged = {}  # key: norm_name -> row dict
order = []
for row in WEB_ROWS:
    name, domain, hq, fte, stage, raised, last_round, investors, tech, sectors, why_now, source = row
    key = norm_name(name)
    d = norm_domain(domain)
    if key not in merged:
        merged[key] = dict(name=name, domain=d, hq=hq, fte=fte, stage=stage, raised=raised,
                            last_round=last_round, investors=set([investors]) if investors != U else set(),
                            tech=tech, sectors=sectors, why_now=why_now, sources=set([source]))
        order.append(key)
    else:
        m = merged[key]
        if not m['domain'] and d:
            m['domain'] = d
        if m['hq'] == U and hq != U:
            m['hq'] = hq
        if m['fte'] == U and fte != U:
            m['fte'] = fte
        if m['stage'] == U and stage != U:
            m['stage'] = stage
        if m['raised'] == U and raised != U:
            m['raised'] = raised
        if m['last_round'] == U and last_round != U:
            m['last_round'] = last_round
        if investors != U:
            m['investors'].add(investors)
        if m['why_now'] == U and why_now != U:
            m['why_now'] = why_now
        m['sources'].add(source)

print(f"Unique web-sourced companies after name-merge: {len(merged)}")

# Now cross-check against Pipedrive by name and by domain
pd_by_domain = {}
pd_by_name = {}
for p in PIPEDRIVE:
    d = norm_domain(p['domain'])
    if d:
        pd_by_domain[d] = p
    pd_by_name[norm_name(p['name'])] = p

overlap_domain = 0
overlap_name = 0
for key, m in merged.items():
    if m['domain'] and m['domain'] in pd_by_domain:
        overlap_domain += 1
    elif key in pd_by_name:
        overlap_name += 1

print(f"Web rows overlapping Pipedrive by domain: {overlap_domain}, by name: {overlap_name}")
print(f"Pipedrive-only additional companies: {len(PIPEDRIVE)}")

# Write merged list out for inspection
import json
out = []
for key in order:
    m = merged[key]
    out.append(dict(name=m['name'], domain=m['domain'], hq=m['hq'], fte=m['fte'], stage=m['stage'],
                     raised=m['raised'], last_round=m['last_round'], investors=sorted(m['investors']),
                     tech=m['tech'], sectors=m['sectors'], why_now=m['why_now'], sources=sorted(m['sources'])))

with open('/home/runner/work/herb/herb/.herb_run_tmp/merged_web.json', 'w') as f:
    json.dump(out, f, indent=1)

print(f"\nTotal unique web companies: {len(out)}")
print(f"Total pipedrive companies: {len(PIPEDRIVE)}")
print(f"GRAND TOTAL before final cross-dedup: {len(out) + len(PIPEDRIVE)}")
