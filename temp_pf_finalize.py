#!/usr/bin/env python3
import re
from temp_pf_companies import ROWS
from temp_pf_resolve import RESOLVED

GROWTH_FAIL = {"MycoTechnology", "Matr Foods / MATR", "Bioseutica", "c-LEcta GmbH"}
EIC_OVERRIDE = {"Bioalbumen", "Esencia Foods", "NoPalm Oil"}
BIZMODEL_FAIL = {"Flying Embers": "B2C consumer probiotic beverage brand, not B2B ingredient supplier"}

def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def segment_for(r):
    t = (r.get('tech','') + ' ' + r.get('sectors','')).lower()
    if r.get('tech', 'Unknown') == 'Unknown':
        return "Unclassified / insufficient data"
    if any(k in t for k in ['dairy', 'casein', 'whey', 'egg', 'milk protein', 'cheese', 'ovalbumin', 'lactalbumin']):
        return "Dairy & egg proteins"
    if any(k in t for k in ['strain engineering', 'genomic', 'metabolic engineering', 'protein/enzyme design', 'strain improvement', 'genome editing', 'directed evolution', 'gene engineering', 'biocatalysis', 'enzyme-directed']):
        return "Strain engineering & synbio platforms"
    if any(k in t for k in ['bioreactor', 'bioprocess', 'scale-up', 'fermentation optimization', 'monitoring', 'infrastructure', 'contract fermentation', 'downstream processing', 'software', 'database', 'wastewater', 'manufacturing platform']):
        return "Bioprocess & scale-up infrastructure"
    if any(k in t for k in ['fat', 'oil', 'palm']):
        return "Alt fats & oils"
    if any(k in t for k in ['color', 'pigment', 'red 40', 'dye']):
        return "Colors & pigments"
    if any(k in t for k in ['flavor', 'flavour', 'aroma', 'vanillin', 'melanin', 'brazzein', 'iron', 'emulsifier', 'sweetener', 'chocolate', 'byproduct', 'bioactive']):
        return "Flavors & functional ingredients"
    if any(k in t for k in ['meat', 'mycoprotein', 'mycelium', 'fungal fermentation protein', 'seafood', 'beverage']):
        return "Alt meat & mycoprotein"
    if any(k in t for k in ['algae', 'microalgae']):
        return "Algae-based ingredients (adjacent)"
    if any(k in t for k in ['protein', 'biomanufacturing', 'microbial', 'chemicals']):
        return "Microbial protein & biomanufacturing platforms"
    return "Other fermentation-derived ingredients"

kept = [dict(r) for r in ROWS if not r.get('exclude') and 'dup' not in r.get('tech','').lower()]

# dedup by domain/name
seen = {}
order = []
for r in kept:
    key = norm(r.get('website') or '') or norm(r['name'].split('/')[0].split('(')[0])
    if key in seen:
        seen[key]['source'] += '; ' + r['source']
        continue
    seen[key] = r
    order.append(key)

final = []
for k in order:
    r = seen[k]
    name = r['name']
    website = RESOLVED.get(name, r.get('website') or '')
    stage = r.get('stage', 'Unknown') or 'Unknown'
    notes_parts = []

    if r.get('pd_status'):
        notes_parts.append(f"Pipedrive: {r['pd_status']}")

    prescreen_fail = None
    if name in EIC_OVERRIDE:
        stage = "Series A"
        notes_parts.append("EIC Accelerator 2024 beneficiary (stage estimated as Series A)")
    elif name in GROWTH_FAIL:
        prescreen_fail = "stage out of range (Growth/established, beyond Series B)"
    elif stage.lower().startswith('growth'):
        prescreen_fail = "stage out of range (Growth, beyond Series B)"
    elif 'establish' in stage.lower():
        prescreen_fail = "stage out of range (established company)"

    if name in BIZMODEL_FAIL and not prescreen_fail:
        prescreen_fail = BIZMODEL_FAIL[name]

    if prescreen_fail:
        notes_parts.append(f"Pre-screen: Fail — {prescreen_fail}")

    if r.get('note'):
        notes_parts.append(f"Mandate fit note: {r['note']}")
    if r.get('raised'):
        notes_parts.append(f"Raised: {r['raised']}")
    if r.get('investors'):
        notes_parts.append(f"Investors: {r['investors']}")

    desc = r.get('tech', 'Unknown')
    segment = segment_for(r)

    final.append({
        "name": name,
        "description": desc,
        "website": website,
        "linkedin": "",
        "stage": stage,
        "geography": r.get('hq', 'Unknown'),
        "segment": segment,
        "score": None,
        "source": r['source'],
        "notes": " | ".join(notes_parts) if notes_parts else "",
    })

if __name__ == "__main__":
    print("Total final companies:", len(final))
    fails = [f for f in final if 'Pre-screen: Fail' in f['notes']]
    print("Pre-screen fails:", len(fails))
    for f in fails:
        print(" -", f['name'], '|', f['notes'])
    print()
    from collections import Counter
    print(Counter(f['segment'] for f in final))
    blanks = [f['name'] for f in final if not f['website']]
    print("Still blank website:", len(blanks), blanks)
