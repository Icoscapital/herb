#!/usr/bin/env python3
"""Compile and enrich company data from search results."""

companies_raw = [
    # Batch 1 - Crunchbase
    {"name": "Asperitas", "hq_country": "Netherlands", "source": "Crunchbase"},
    {"name": "Immers Cloud", "hq_country": "Europe", "source": "Crunchbase"},
    {"name": "Iceotope", "hq_country": "UK", "domain": "iceotope.com", "stage": "Series B", "raised": "$26M", "last_round": "2025", "investors": "Two Seas Capital, Barclays Climate Ventures", "source": "Crunchbase"},
    {"name": "MegaCool Technologies", "hq_country": "Belgium", "source": "Crunchbase"},
    {"name": "Accelsius", "hq_country": "Unknown", "source": "Crunchbase"},
    {"name": "LiquidStack", "hq_country": "Unknown", "source": "Crunchbase"},
    {"name": "JETCOOL Technologies", "hq_country": "Unknown", "source": "Crunchbase"},
    {"name": "LiquidCool Solutions", "hq_country": "Unknown", "source": "Crunchbase"},

    # Batch 1 - X/Twitter
    {"name": "Corintis", "domain": "corintis.ch", "hq_country": "Switzerland", "stage": "Series A", "raised": "€20M", "last_round": "2025", "source": "X/Twitter"},
    {"name": "DCX Liquid Cooling", "domain": "dcxliquidcool.com", "hq_country": "Unknown", "source": "X/Twitter"},

    # Batch 1 - LinkedIn
    {"name": "DCX Liquid Cooling Systems", "hq_country": "Unknown", "source": "LinkedIn"},
    {"name": "Immersion4", "hq_country": "UK", "source": "LinkedIn"},
    {"name": "Iceotope Technologies Limited", "hq_country": "UK", "source": "LinkedIn"},
    {"name": "Chilldyne", "hq_country": "Austria", "source": "LinkedIn"},
    {"name": "Heatflow ApS", "hq_country": "Denmark", "source": "LinkedIn"},
    {"name": "Thermosphr", "hq_country": "Germany", "source": "LinkedIn"},
    {"name": "PeaSoup.Cloud", "hq_country": "UK", "source": "LinkedIn"},

    # Batch 2 - Conferences
    {"name": "Incooling", "hq_country": "Netherlands", "source": "Conferences"},

    # Batch 3 - Startup news
    {"name": "Apheros", "domain": "apheros.io", "hq_country": "Switzerland", "stage": "Pre-Seed", "raised": "€1.65M", "last_round": "2024", "investors": "Founderful", "source": "Startup news"},
    {"name": "Submer", "domain": "submer.tech", "hq_country": "Spain", "stage": "Growth", "raised": "$55.5M", "last_round": "2024", "investors": "M&G", "source": "Startup news"},
]

# Deduplicate by name (case-insensitive)
seen = {}
deduped = []
for company in companies_raw:
    name_key = company["name"].lower().replace(" ", "")
    # Handle DCX variants
    if "dcxliquid" in name_key:
        name_key = "dcxliquidcooling"
    # Handle Iceotope variants
    if "iceotope" in name_key:
        name_key = "iceotope"

    if name_key not in seen:
        seen[name_key] = company
        deduped.append(company)
    else:
        # Merge data
        existing = seen[name_key]
        for key, value in company.items():
            if key not in existing or existing[key] in ["Unknown", "Europe", ""]:
                existing[key] = value
            elif key == "source":
                if company["source"] not in existing["source"]:
                    existing["source"] += ", " + company["source"]

print(f"Total unique companies: {len(deduped)}")
print("\nCompanies needing enrichment:")
for i, company in enumerate(deduped, 1):
    missing = []
    if "domain" not in company or not company.get("domain"):
        missing.append("domain")
    if "stage" not in company or company.get("stage") == "Unknown":
        missing.append("stage")
    if "raised" not in company or not company.get("raised"):
        missing.append("funding")

    if missing:
        print(f"{i}. {company['name']} ({company['hq_country']}) - missing: {', '.join(missing)}")

# Export for enrichment
import json
with open("/home/runner/work/herb/herb/temp_companies_to_enrich.json", "w") as f:
    json.dump(deduped, f, indent=2)

print(f"\nSaved {len(deduped)} companies to temp_companies_to_enrich.json")
