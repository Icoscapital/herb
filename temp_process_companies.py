#!/usr/bin/env python3
"""Process companies: dedupe, Pipedrive cross-check, pre-screen, score."""
import os
import sys
from scripts.pipedrive_client import PipedriveClient
from scripts.pipedrive_batch import batch_search_organizations

# Raw companies from search agents
raw_companies = [
    {
        "name": "Onego Bio",
        "domain": "onego.bio",
        "hq_country": "Finland",
        "stage": "Series A",
        "raised": "EUR 27M",
        "last_round": "2024",
        "investors": "NordicNinja VC, Business Finland",
        "tech": "Precision fermentation - Bioalbumen (animal-free egg protein)",
        "sectors": "Food biotech, Alt protein",
        "source": "LinkedIn, Conferences",
        "notes": "",
    },
    {
        "name": "MOA Foodtech",
        "domain": "moafoodtech.com",
        "hq_country": "Spain",
        "stage": "Series B",
        "raised": "EUR 14.8M",
        "last_round": "EIC Accelerator 2025",
        "investors": "European Innovation Council",
        "tech": "Biomass fermentation + AI-driven production",
        "sectors": "Alt protein, Food ingredients",
        "source": "Conferences, Accelerators",
        "notes": "Mentioned in user theme",
    },
    {
        "name": "Holloid GmbH",
        "domain": "Unknown",
        "hq_country": "Austria",
        "stage": "Series A",
        "raised": "EUR 2.5M",
        "last_round": "EIC Accelerator 2025",
        "investors": "EIC",
        "tech": "Bioprocess monitoring - holographic microscopy + AI",
        "sectors": "Bioprocess control, Food tech",
        "source": "Conferences",
        "notes": "",
    },
    {
        "name": "Melt&Marble",
        "domain": "Unknown",
        "hq_country": "Unknown",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Unknown",
        "tech": "Precision fermentation - designer fats",
        "sectors": "Biotech, Food ingredients",
        "source": "Conferences",
        "notes": "EIC Accelerator winner",
    },
    {
        "name": "NoPalm Ingredients",
        "domain": "nopalm.ingredients",
        "hq_country": "Netherlands",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Unknown",
        "tech": "Fermentation - microbial oils",
        "sectors": "Sustainable oils, Food ingredients",
        "source": "Conferences",
        "notes": "Hello Tomorrow 2024 finalist",
    },
    {
        "name": "Yeastup",
        "domain": "yeastup.com",
        "hq_country": "Switzerland",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Unknown",
        "tech": "Fermentation - upcycled beer by-products",
        "sectors": "Sustainable ingredients",
        "source": "Conferences",
        "notes": "Hello Tomorrow 2024 finalist",
    },
    {
        "name": "Alt Biotech",
        "domain": "Unknown",
        "hq_country": "France",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Unknown",
        "tech": "Bioproduction via fermentation",
        "sectors": "Industrial biotech",
        "source": "Conferences",
        "notes": "Hello Tomorrow 2024 finalist",
    },
    {
        "name": "Esencia Foods",
        "domain": "Unknown",
        "hq_country": "Germany",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Unknown",
        "tech": "Mycelium biotechnology - seafood alternative",
        "sectors": "Alt protein, Food",
        "source": "Conferences",
        "notes": "Hello Tomorrow 2024 finalist",
    },
    {
        "name": "Standing Ovation",
        "domain": "Unknown",
        "hq_country": "France",
        "stage": "Series B",
        "raised": "EUR 30M",
        "last_round": "2026 Q1",
        "investors": "Unknown",
        "tech": "Precision fermentation dairy proteins",
        "sectors": "Alternative proteins",
        "source": "News sites",
        "notes": "",
    },
    {
        "name": "Vivici",
        "domain": "Unknown",
        "hq_country": "Netherlands",
        "stage": "Series B",
        "raised": "EUR 32M",
        "last_round": "2025 Q1",
        "investors": "Unknown",
        "tech": "Precision fermentation dairy proteins",
        "sectors": "Alternative proteins",
        "source": "News sites, Accelerators",
        "notes": "",
    },
    {
        "name": "Meatly",
        "domain": "Unknown",
        "hq_country": "UK",
        "stage": "Series A",
        "raised": "GBP 10.4M",
        "last_round": "2026 Q2",
        "investors": "Unknown",
        "tech": "Cell culture bioreactor",
        "sectors": "Cultivated meat",
        "source": "News sites",
        "notes": "Building Europe's largest cultivated meat bioreactor facility",
    },
    {
        "name": "Verdiva Bio",
        "domain": "Unknown",
        "hq_country": "UK",
        "stage": "Series A",
        "raised": "USD 410M",
        "last_round": "2025 Q1",
        "investors": "Unknown",
        "tech": "Biotech drug development",
        "sectors": "Pharma/biotech",
        "source": "News sites",
        "notes": "Large-scale biotech - likely NOT food/specialty chemicals",
    },
    {
        "name": "Azafaros",
        "domain": "Unknown",
        "hq_country": "Unknown",
        "stage": "Series B",
        "raised": "EUR 132M",
        "last_round": "2025",
        "investors": "Unknown",
        "tech": "Rare genetic disorder therapies",
        "sectors": "Pharma/biotech",
        "source": "News sites",
        "notes": "Pharma - NOT relevant to theme",
    },
    {
        "name": "Sensible Biotechnologies",
        "domain": "sensiblebiotech.com",
        "hq_country": "UK",
        "stage": "Unknown",
        "raised": "Unknown",
        "last_round": "Unknown",
        "investors": "Y Combinator",
        "tech": "Cell engineering, mRNA precision fermentation",
        "sectors": "Biotech",
        "source": "Accelerators",
        "notes": "YC-backed, Oxford/Bratislava ops",
    },
    {
        "name": "PFx Biotech",
        "domain": "pfxbiotech.com",
        "hq_country": "Portugal",
        "stage": "Series A",
        "raised": "EUR 2.5M",
        "last_round": "June 2025",
        "investors": "Unknown",
        "tech": "Precision fermentation, human milk proteins",
        "sectors": "Alternative proteins",
        "source": "Accelerators",
        "notes": "Lisbon-based, scaling proteins",
    },
    {
        "name": "Bloom Biorenewables",
        "domain": "Unknown",
        "hq_country": "Switzerland",
        "stage": "Series A",
        "raised": "EUR 35M",
        "last_round": "2024",
        "investors": "Unknown",
        "tech": "Precision fermentation",
        "sectors": "Biorenewables",
        "source": "Accelerators",
        "notes": "Cosmetics supply agreements 2025",
    },
]

# Dedup by domain
seen_domains = {}
deduped = []
for c in raw_companies:
    domain = c["domain"].lower() if c["domain"] != "Unknown" else None
    if domain and domain in seen_domains:
        # Merge sources
        existing = seen_domains[domain]
        if c["source"] not in existing["source"]:
            existing["source"] += f", {c['source']}"
        # Fill in any Unknown fields
        for k in c:
            if existing.get(k) == "Unknown" and c[k] != "Unknown":
                existing[k] = c[k]
    else:
        if domain:
            seen_domains[domain] = c
        deduped.append(c)

print(f"[HERB] Deduped: {len(raw_companies)} -> {len(deduped)} companies")

# Pipedrive cross-check
client = PipedriveClient(
    domain=os.environ["PIPEDRIVE_DOMAIN"],
    api_token=os.environ["PIPEDRIVE_TOKEN"],
)

print("[HERB] Starting Pipedrive cross-check (batches of 5)...")
names = [c["name"] for c in deduped]
pipedrive_results = batch_search_organizations(client, names)

# Enhance companies with Pipedrive status
for i, c in enumerate(deduped):
    pd_org = pipedrive_results[i]
    if pd_org and pd_org.get("id"):
        # Found in Pipedrive - fetch deals to determine status
        org_id = pd_org["id"]
        try:
            deals = client.list_all_deals_for_org(org_id)
            if not deals:
                c["pipedrive_status"] = "New"
            else:
                # Check most recent deal
                latest_deal = max(deals, key=lambda d: d.get("update_time", ""))
                status = latest_deal.get("status", "").lower()
                if status == "open":
                    stage_name = latest_deal.get("stage_name", "Unknown")
                    c["pipedrive_status"] = f"Open — {stage_name}"
                elif status == "won":
                    c["pipedrive_status"] = "Won"
                elif status == "lost":
                    lost_reason = latest_deal.get("lost_reason", "Unknown")
                    lost_date = latest_deal.get("lost_time", "Unknown")[:10] if latest_deal.get("lost_time") else "Unknown"
                    c["pipedrive_status"] = f"Lost — {lost_date}"
                    c["lost_reason"] = lost_reason
                else:
                    c["pipedrive_status"] = "Open — Unknown"
        except Exception as e:
            print(f"WARN: Failed to fetch deals for {c['name']}: {e}", file=sys.stderr)
            c["pipedrive_status"] = "Unknown"
    else:
        c["pipedrive_status"] = "New"

print(f"[HERB] Pipedrive cross-check complete")

# Pre-screen evaluation
def prescreen(c: dict) -> tuple[bool, str]:
    """Returns (pass, reason)."""

    # Sector check
    sectors_lower = c["sectors"].lower()
    valid_sectors = [
        "food", "nutrition", "specialty chemicals", "advanced materials",
        "industry ai", "ccus", "biotech", "alt protein", "alternative protein",
        "biorenewables", "sustainable"
    ]
    has_sector = any(s in sectors_lower for s in valid_sectors)
    if not has_sector:
        return False, f"Sector mismatch: {c['sectors']}"

    # Exclude pure pharma (not specialty chemicals/food)
    if "pharma" in sectors_lower and not any(s in sectors_lower for s in ["food", "chemical", "material"]):
        return False, "Pure pharma (not food/chemicals)"

    # Stage check
    stage_lower = c["stage"].lower()
    if "series a" not in stage_lower and "series b" not in stage_lower:
        if stage_lower != "unknown":
            return False, f"Stage {c['stage']} not Series A/B"
        # Unknown stage - keep but flag

    # B2B/Mixed check (hard to determine from data, assume pass if food/biotech)
    # This would need more context - for now pass

    # LP flag check - needs domain knowledge, approximate:
    # Nouryon: specialty chemicals
    # Bühler: food/grain processing
    # FrieslandCampina: dairy/nutrition
    lp_relevant = False
    tech_lower = c["tech"].lower()
    if any(k in tech_lower or k in sectors_lower for k in [
        "specialty chemical", "food", "dairy", "nutrition", "grain",
        "fermentation", "bioprocess", "ingredient"
    ]):
        lp_relevant = True

    if not lp_relevant:
        return False, "No LP flag match (Nouryon/Bühler/FrieslandCampina)"

    return True, "Pass"

for c in deduped:
    # Skip pre-screen for Open/Won/Lost companies
    if c["pipedrive_status"] not in ["New", "Unknown"]:
        c["prescreen_pass"] = None
        c["prescreen_reason"] = f"Skipped (Pipedrive: {c['pipedrive_status']})"
        c["icos_fit_score"] = None
    else:
        pass_gate, reason = prescreen(c)
        c["prescreen_pass"] = pass_gate
        c["prescreen_reason"] = reason
        c["icos_fit_score"] = None  # Will be scored by agent

print(f"[HERB] Pre-screen complete")

# Output for scoring
import json
print("\n=== COMPANIES FOR SCORING ===")
print(json.dumps(deduped, indent=2))
