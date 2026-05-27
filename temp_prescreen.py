#!/usr/bin/env python3
"""Pre-screen companies according to field-spec criteria"""

import json

# Load companies with Pipedrive status
with open('/home/runner/work/herb/herb/temp_companies_with_pipedrive.json', 'r') as f:
    companies = json.load(f)

# Pre-screen criteria from field-spec.md:
# - Icos sector ≠ None (Food/Nutrition+, Specialty Chemicals+, Advanced Materials+, Industry AI, CCUS)
# - Funding stage = Series A or B (or Unknown but plausible from context)
# - Business model = B2B or Mixed
# - At least one LP flag = Yes or Maybe (Nouryon, Bühler, FrieslandCampina)

def assign_icos_sector(company):
    """Assign Icos sector based on tech/sectors"""
    tech = company.get("tech", "").lower()
    sectors = company.get("sectors", "").lower()
    combined = f"{tech} {sectors}"

    # Food/Nutrition+: food tech, fermentation for food, algae for food, preservatives
    if any(kw in combined for kw in ["food", "nutrition", "fermentation", "algae", "preservation", "dairy", "protein", "aquaculture", "feed", "pet food"]):
        return "Food/Nutrition+"

    # Advanced Materials+: biopolymers, biomedical polymers
    if any(kw in combined for kw in ["biopolymer", "polymer", "biomaterial", "biomedical"]):
        return "Advanced Materials+"

    # Specialty Chemicals+: specialty chemicals, lactic acid platforms
    if any(kw in combined for kw in ["chemical", "lactic acid"]):
        return "Specialty Chemicals+"

    return "None"

def assign_lp_relevance(company):
    """Assign LP relevance flags"""
    tech = company.get("tech", "").lower()
    sectors = company.get("sectors", "").lower()
    combined = f"{tech} {sectors}"

    # Nouryon: specialty chemicals, polymers, biomedical polymers
    nouryon = "Maybe" if any(kw in combined for kw in ["chemical", "polymer", "biomedical"]) else "No"

    # Bühler: food processing, food tech, food ingredients, algae for food
    buhler = "Maybe" if any(kw in combined for kw in ["food", "fermentation", "algae", "protein", "ingredient", "preservation"]) else "No"

    # FrieslandCampina: dairy, nutrition, food ingredients, fermentation
    friesland = "Maybe" if any(kw in combined for kw in ["dairy", "nutrition", "fermentation", "protein", "ingredient", "milk"]) else "No"

    return nouryon, buhler, friesland

def infer_business_model(company):
    """Infer B2B vs B2C"""
    tech = company.get("tech", "").lower()
    sectors = company.get("sectors", "").lower()
    combined = f"{tech} {sectors}"

    # Most food tech, ingredient, biomedical, material companies are B2B
    if any(kw in combined for kw in ["ingredient", "platform", "biomedical", "polymer", "material", "feed", "aquaculture", "b2b"]):
        return "B2B"

    # Food products could be B2C or Mixed
    if any(kw in combined for kw in ["food tech", "alternative protein", "dairy", "seafood"]):
        return "Mixed"

    return "Unknown"

# Process each company
prescreened = []
for company in companies:
    pd_status = company.get("pipedrive_status", "New")

    # Skip Open/Won/Lost companies from icos-fit-eval, but keep on longlist
    if pd_status != "New":
        company["prescreen_result"] = "Skip - Already in Pipedrive"
        company["skip_icos_fit"] = True
        prescreened.append(company)
        continue

    # Assign fields needed for pre-screen
    company["icos_sector"] = assign_icos_sector(company)
    nouryon, buhler, friesland = assign_lp_relevance(company)
    company["nouryon_relevance"] = nouryon
    company["buhler_relevance"] = buhler
    company["frieslandcampina_relevance"] = friesland
    company["business_model"] = infer_business_model(company)

    # Get stage - default to "Unknown" if not set
    stage = company.get("stage", "Unknown")

    # Apply pre-screen gate
    reasons = []

    if company["icos_sector"] == "None":
        reasons.append("No Icos sector match")

    if stage not in ["Seed", "Series A", "Series B", "Unknown"]:
        if stage not in ["Incubator", "Early"]:
            reasons.append(f"Stage {stage} outside target")

    if company["business_model"] not in ["B2B", "Mixed", "Unknown"]:
        reasons.append(f"Business model {company['business_model']}")

    if nouryon == "No" and buhler == "No" and friesland == "No":
        reasons.append("No LP relevance")

    if reasons:
        company["prescreen_result"] = f"Fail — {'; '.join(reasons)}"
        company["skip_icos_fit"] = True
    else:
        company["prescreen_result"] = "Pass"
        company["skip_icos_fit"] = False

    prescreened.append(company)

# Save results
with open('/home/runner/work/herb/herb/temp_companies_prescreened.json', 'w') as f:
    json.dump(prescreened, f, indent=2)

# Summary
pass_count = sum(1 for c in prescreened if c.get("prescreen_result") == "Pass")
fail_count = sum(1 for c in prescreened if c.get("prescreen_result", "").startswith("Fail"))
skip_count = sum(1 for c in prescreened if c.get("prescreen_result", "").startswith("Skip"))

print(f"\n" + "="*60)
print(f"Pre-screen complete!")
print(f"  Pass (will run icos-fit-eval): {pass_count}")
print(f"  Fail (on longlist but no eval): {fail_count}")
print(f"  Skip (already in Pipedrive): {skip_count}")
print(f"  Total: {len(prescreened)}")
print(f"="*60)

print(f"\nCompanies that passed pre-screen:")
for c in prescreened:
    if c.get("prescreen_result") == "Pass":
        print(f"  • {c['name']} ({c['hq']}) - {c['icos_sector']} - {c['tech'][:60]}...")
