#!/usr/bin/env python3
"""Prepare final results for finish_run"""

import json

# Load prescreened companies
with open('/home/runner/work/herb/herb/temp_companies_prescreened.json', 'r') as f:
    companies = json.load(f)

# Convert to format expected by finish_run
# Expected fields: name, description, website, linkedin, stage, geography, score, source, notes
results = []

for company in companies:
    # Build description from tech
    tech = company.get("tech", "Unknown")
    sectors = company.get("sectors", "")
    description = tech
    if sectors and sectors != "Unknown":
        description += f" | Sectors: {sectors}"

    # Build notes
    notes_parts = []
    notes_parts.append(f"Pipedrive: {company.get('pipedrive_status', 'New')}")

    if company.get("prescreen_result"):
        notes_parts.append(f"Pre-screen: {company['prescreen_result']}")

    if company.get("icos_sector"):
        notes_parts.append(f"Icos sector: {company['icos_sector']}")

    if company.get("raised"):
        notes_parts.append(f"Raised: {company['raised']}")

    if company.get("investors"):
        notes_parts.append(f"Investors: {company['investors']}")

    # LP relevance
    lp_flags = []
    if company.get("nouryon_relevance") in ["Yes", "Maybe"]:
        lp_flags.append(f"Nouryon: {company['nouryon_relevance']}")
    if company.get("buhler_relevance") in ["Yes", "Maybe"]:
        lp_flags.append(f"Bühler: {company['buhler_relevance']}")
    if company.get("frieslandcampina_relevance") in ["Yes", "Maybe"]:
        lp_flags.append(f"FrieslandCampina: {company['frieslandcampina_relevance']}")
    if lp_flags:
        notes_parts.append(" | ".join(lp_flags))

    result = {
        "name": company["name"],
        "description": description,
        "website": company.get("domain", "Unknown"),
        "linkedin": f"https://linkedin.com/company/{company['name'].lower().replace(' ', '-')}" if company.get("hq") else "",
        "stage": company.get("stage", "Unknown"),
        "geography": company.get("hq", "Unknown"),
        "score": 0,  # No scoring done
        "source": company.get("source", "Unknown"),
        "notes": " | ".join(notes_parts)
    }

    results.append(result)

# Sort: Pass pre-screen first, then by geography (Thailand, Singapore, Malaysia)
def sort_key(r):
    prescreen_priority = 0 if "Pass" in r["notes"] else (1 if "Fail" in r["notes"] else 2)
    geo_priority = {"Thailand": 0, "Singapore": 1, "Malaysia": 2}.get(r["geography"], 3)
    return (prescreen_priority, geo_priority, r["name"])

results.sort(key=sort_key)

# Save
with open('/home/runner/work/herb/herb/temp_final_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print(f"Prepared {len(results)} companies for finish_run")
print(f"\nTop 10 companies:")
for i, r in enumerate(results[:10], 1):
    print(f"{i}. {r['name']} ({r['geography']}) - {r['stage']}")
