#!/usr/bin/env python3
"""Compile and deduplicate companies from all sources"""

import re
from difflib import SequenceMatcher

# All companies found across sources
companies_raw = [
    # LinkedIn results
    {"name": "Algrow Biosciences", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Microalgae protein extraction", "sectors": "Food/Feed", "source": "LinkedIn"},
    {"name": "Algaeba", "domain": "Unknown", "hq": "Thailand", "stage": "Unknown", "tech": "Microalgae concentrate, aquaculture feed", "sectors": "Food/Feed/Aquaculture", "source": "LinkedIn"},
    {"name": "EVES Energy", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Algae oil, dried algae protein", "sectors": "Food/Feed", "source": "LinkedIn"},
    {"name": "Nurasa", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Precision fermentation, submerged microbial fermentation", "sectors": "Food Tech", "source": "LinkedIn"},
    {"name": "HTL Biotechnology", "domain": "Unknown", "hq": "Unknown", "stage": "Unknown", "tech": "Pharmaceutical-grade biopolymers", "sectors": "Biomedical", "source": "LinkedIn"},
    {"name": "Biocon Solutions Pte Ltd", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Biomedical solutions", "sectors": "Biomedical", "source": "LinkedIn"},
    {"name": "ACM Biolabs", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Polymer-based delivery platforms", "sectors": "Biomedical", "source": "LinkedIn"},
    {"name": "Bio-REV Pte Ltd", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "tech": "Scientific equipment, reagents", "sectors": "Biomedical", "source": "LinkedIn"},

    # News sites
    {"name": "Greenitio", "domain": "Unknown", "hq": "Singapore", "stage": "Seed", "raised": "$1.5M", "last_round": "Seed", "investors": "SGInnovate", "tech": "Fungal-derived chitosan biopolymers", "sectors": "Cosmetics, personal care, specialty chemicals", "source": "KrASIA"},
    {"name": "Melazyme", "domain": "Unknown", "hq": "USA", "stage": "Seed", "raised": "$2M", "last_round": "Seed (May 2025)", "investors": "SeaX Ventures, Stellaris, Plug and Play", "tech": "Precision fermentation for biomolecules (melanin)", "sectors": "Food & beverage", "source": "KrASIA"},

    # VC portfolios
    {"name": "Life3 Biotech", "domain": "Unknown", "hq": "Singapore", "stage": "Growth", "tech": "Food-grade microalgae bioreactors with Omega-3", "sectors": "Food preservation, Algae", "source": "VC Roster: Temasek"},
    {"name": "ScaleUp Bio", "domain": "Unknown", "hq": "Singapore", "stage": "Commercial", "investors": "ADM, Temasek", "tech": "Microbial protein production", "sectors": "Food tech, Fermentation", "source": "VC Roster: Temasek"},
    {"name": "AIM Biotech", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "investors": "Wavemaker Partners", "tech": "3D Cell Culture Chips for research & drug development", "sectors": "Biomedical, Biotech", "source": "VC Roster: Wavemaker Partners"},
    {"name": "Attonics", "domain": "Unknown", "hq": "Unknown", "stage": "Unknown", "investors": "Wavemaker Partners", "tech": "Miniature spectrometers", "sectors": "Food Quality, Agritech, Diagnostics", "source": "VC Roster: Wavemaker Partners"},
    {"name": "Ingrediome", "domain": "Unknown", "hq": "Thailand", "stage": "Unknown", "investors": "IndieBio/SOSV", "tech": "Precision fermentation for animal proteins using cyanobacteria", "sectors": "Food Tech", "source": "VC Roster: IndieBio"},
    {"name": "Shiok Meats", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "investors": "Big Idea Ventures", "tech": "Cell-based seafood", "sectors": "Food Tech", "source": "VC Roster: Big Idea Ventures"},

    # Thailand direct search
    {"name": "Muu", "domain": "Unknown", "hq": "Thailand", "stage": "Seed", "investors": "A2D Ventures, Leave a Nest Japan", "tech": "Animal-free dairy proteins via precision fermentation", "sectors": "Food Tech, Alternative Protein", "source": "Thailand Direct"},
    {"name": "Regene Bio", "domain": "Unknown", "hq": "Thailand", "stage": "Seed", "tech": "Plant-based milk protein via synbio", "sectors": "Food Tech, Alternative Protein", "source": "Thailand Direct"},
    # Algaeba already in LinkedIn list
    {"name": "Prefer", "domain": "Unknown", "hq": "Thailand", "stage": "Incubator", "investors": "SPACE-F Batch 5", "tech": "Fermentation of bread, soy, barley into coffee flavors", "sectors": "Food Tech, Fermentation", "source": "Thailand Direct / SPACE-F"},
    {"name": "BioShield", "domain": "Unknown", "hq": "Thailand", "stage": "Incubator", "investors": "SPACE-F Batch 5", "tech": "Food preservation solutions", "sectors": "Food Tech, Preservation", "source": "Thailand Direct / SPACE-F"},
    # Ingrediome already in VC list
    {"name": "UniFAHS", "domain": "Unknown", "hq": "Thailand", "stage": "Incubator", "investors": "SPACE-F Batch 5", "tech": "PhagePrompt™ phage solutions for AMR in food", "sectors": "Food Tech, Food Safety", "source": "Thailand Direct / SPACE-F"},

    # Singapore direct search
    # Life3 Biotech already listed
    {"name": "Sophie's BioNutrients", "domain": "Unknown", "hq": "Singapore", "stage": "Seed", "raised": "$1M SGD", "last_round": "2019", "investors": "The Liveability Challenge", "tech": "Microalgae fermentation, food waste upcycling", "sectors": "Alternative protein, food tech", "source": "Singapore Direct"},
    {"name": "Allozymes", "domain": "Unknown", "hq": "Singapore", "stage": "Unknown", "investors": "ScaleUp Bio / Fermentation Joint Lab", "tech": "Precision-fermented engineering platform", "sectors": "Food ingredients", "source": "Singapore Direct"},
    # Algrow already in LinkedIn list
    {"name": "Terra Oleo", "domain": "Unknown", "hq": "Singapore", "stage": "Seed", "raised": "$3.1M", "tech": "Waste-derived precision-fermented palm oil and cocoa butter substitutes", "sectors": "Food ingredients, sustainability", "source": "Singapore Direct"},
    {"name": "Allay Therapeutics", "domain": "Unknown", "hq": "Singapore/US", "stage": "Growth", "tech": "Biopolymers for pain relief, dissolvable formulations", "sectors": "Biomedical, polymers", "source": "Singapore Direct"},
    {"name": "RWDC Industries", "domain": "Unknown", "hq": "Singapore/US", "stage": "Unknown", "tech": "Biotech biomaterials", "sectors": "Biomaterials", "source": "Singapore Direct"},

    # Malaysia direct search
    {"name": "Seadling", "domain": "Unknown", "hq": "Malaysia", "stage": "Seed", "raised": "$1M", "last_round": "Seed", "investors": "AgFunder, The Yield Lab Asia Pacific, Toyo Seikan Group, Katapult Ocean", "tech": "Fermented seaweed processing (oligosaccharides, Vitamin K2)", "sectors": "Food ingredients, functional foods, petfood", "source": "Malaysia Direct"},
    {"name": "RWDC", "domain": "Unknown", "hq": "Malaysia", "stage": "Unknown", "raised": "$4.3M USD", "tech": "Biodegradable bioplastic (mcl-PHA via bacterial fermentation)", "sectors": "Packaging, cutlery, straws, diapers", "source": "Malaysia Direct"},
]

def fuzzy_match_name(name1, name2, threshold=0.85):
    """Check if two company names are similar"""
    return SequenceMatcher(None, name1.lower(), name2.lower()).ratio() >= threshold

def deduplicate_companies(companies):
    """Deduplicate by exact name match or fuzzy match"""
    unique = []
    seen_names = set()

    for company in companies:
        name = company["name"]

        # Check exact match first
        if name in seen_names:
            # Merge source tags
            for u in unique:
                if u["name"] == name:
                    if "source" in company and company["source"] not in u.get("source", ""):
                        u["source"] = u.get("source", "") + ", " + company["source"]
                    # Update with more complete data
                    for key, value in company.items():
                        if value and value != "Unknown" and (key not in u or u.get(key) == "Unknown"):
                            u[key] = value
                    break
            continue

        # Check fuzzy match
        is_duplicate = False
        for existing in unique:
            if fuzzy_match_name(name, existing["name"]):
                is_duplicate = True
                # Merge source tags
                if "source" in company and company["source"] not in existing.get("source", ""):
                    existing["source"] = existing.get("source", "") + ", " + company["source"]
                # Update with more complete data
                for key, value in company.items():
                    if value and value != "Unknown" and (key not in existing or existing.get(key) == "Unknown"):
                        existing[key] = value
                break

        if not is_duplicate:
            unique.append(company)
            seen_names.add(name)

    return unique

# Deduplicate
deduped = deduplicate_companies(companies_raw)

# Filter out non-target geographies
target_geos = ["Thailand", "Singapore", "Malaysia"]
filtered = [c for c in deduped if any(geo in c.get("hq", "") for geo in target_geos)]

print(f"Total raw companies: {len(companies_raw)}")
print(f"After deduplication: {len(deduped)}")
print(f"After geography filter: {len(filtered)}")
print("\nFiltered companies:")
for i, c in enumerate(filtered, 1):
    print(f"{i}. {c['name']} ({c.get('hq', 'Unknown')}) - {c.get('tech', 'Unknown')}")

# Export for next step
import json
with open('/home/runner/work/herb/herb/temp_companies_deduped.json', 'w') as f:
    json.dump(filtered, f, indent=2)
