#!/usr/bin/env python3
"""
Prepare final company list for web mandate with pre-screen analysis.
"""

# All companies with enriched data and pre-screen status
companies = [
    # --- LOST in Pipedrive (keep but skip eval) ---
    {
        "name": "Algrow Biosciences",
        "description": "Microalgae protein production for alternative protein applications",
        "website": "Unknown",
        "linkedin": "https://sg.linkedin.com/company/algrow-biosciences",
        "stage": "Startup",
        "geography": "Singapore",
        "score": None,
        "source": "LinkedIn",
        "notes": "Lost in Pipedrive — 2025-09-22 (Not in focus region). Skip icos-fit-eval.",
        "pipedrive_status": "Lost",
    },
    {
        "name": "Next Gen Foods",
        "description": "Alternative protein company (TiNDLE brand chicken alternatives)",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Series A",
        "geography": "Singapore",
        "score": None,
        "source": "News Sites",
        "notes": "Lost in Pipedrive — 2021-06-17 (Not in focus region). Skip icos-fit-eval.",
        "pipedrive_status": "Lost",
    },
    {
        "name": "Sophie's Bionutrients",
        "description": "Microalgae fermentation for plant-based protein flour and ingredients",
        "website": "sophiesbionutrients.com",
        "linkedin": "Unknown",
        "stage": "Early-stage",
        "geography": "Singapore",
        "score": None,
        "source": "Direct Search",
        "notes": "Lost in Pipedrive — 2025-03-11 (too early stage). Skip icos-fit-eval.",
        "pipedrive_status": "Lost",
    },

    # --- NEW companies (pre-screen analysis) ---
    {
        "name": "CJ Bio Malaysia Sdn Bhd",
        "description": "Biochemical production including lactic acid and PLA (polylactic acid) biopolymers",
        "website": "Unknown",
        "linkedin": "https://www.linkedin.com/company/cj-bio-malaysia-sdn-bhd",
        "stage": "Unknown",
        "geography": "Malaysia",
        "score": 7.5,
        "source": "LinkedIn",
        "notes": "STRONG MATCH: Lactic acid + PLA production directly matches Corbion's core business. Specialty Chemicals+ sector. Highly relevant to Nouryon (specialty chemicals). B2B model. PASS pre-screen.",
        "pipedrive_status": "New",
    },
    {
        "name": "Nurasa",
        "description": "Precision fermentation for sustainable food ingredients and alternative proteins in Asia",
        "website": "Unknown",
        "linkedin": "https://sg.linkedin.com/company/nurasa",
        "stage": "Unknown",
        "geography": "Singapore",
        "score": 7.0,
        "source": "LinkedIn",
        "notes": "Precision fermentation for food ingredients. Food/Nutrition+ sector. Relevant to FrieslandCampina (food ingredients), Bühler (food processing). B2B model. PASS pre-screen.",
        "pipedrive_status": "New",
    },
    {
        "name": "PT. Alga Bioteknologi Indonesia (ALBITEC)",
        "description": "Organic spirulina cultivation for nutrition applications",
        "website": "Unknown",
        "linkedin": "https://id.linkedin.com/company/pt-alga-bioteknologi-indonesia-albitec",
        "stage": "Startup",
        "geography": "Indonesia",
        "score": 6.5,
        "source": "LinkedIn",
        "notes": "Algal nutrition (spirulina). Food/Nutrition+ sector. Relevant to FrieslandCampina (nutrition). B2B model likely. PASS pre-screen but may be early stage.",
        "pipedrive_status": "New",
    },
    {
        "name": "PT Spiralife Bioteknologi Indonesia",
        "description": "Microalgal product development for biotechnology and nutrition applications",
        "website": "Unknown",
        "linkedin": "https://id.linkedin.com/company/spiralife",
        "stage": "Startup",
        "geography": "Indonesia",
        "score": 6.5,
        "source": "LinkedIn",
        "notes": "Microalgae for nutrition/biotech. Food/Nutrition+ sector. Relevant to FrieslandCampina. B2B model likely. PASS pre-screen but may be early stage.",
        "pipedrive_status": "New",
    },
    {
        "name": "TurtleTree Labs",
        "description": "Biotech/food company, EF Singapore alumni with $40M+ raised",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Unknown",
        "geography": "Singapore",
        "score": 7.0,
        "source": "Accelerator - EF Singapore",
        "notes": "Significant funding ($40M+). Biotech/food sector likely Food/Nutrition+. Relevant to FrieslandCampina. B2B model likely. PASS pre-screen.",
        "pipedrive_status": "New",
    },
    {
        "name": "Umami Bioworks",
        "description": "Cultivated bioproducts and sustainable biosolutions",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Unknown",
        "geography": "Singapore",
        "score": 6.5,
        "source": "Conference - SLINGSHOT 2024",
        "notes": "Biotech/Food sector, Food/Nutrition+. Relevant to FrieslandCampina, possibly Bühler. B2B model likely. PASS pre-screen.",
        "pipedrive_status": "New",
    },
    {
        "name": "Specialty Natural Products",
        "description": "Thai botanical and herbal extracts for pharmaceutical, dietary supplements, and nutraceuticals",
        "website": "Unknown",
        "linkedin": "https://www.linkedin.com/company/snpthai/",
        "stage": "Unknown",
        "geography": "Thailand",
        "score": 6.0,
        "source": "LinkedIn",
        "notes": "Natural extracts. Could be relevant to food preservation (natural preservatives). Food/Nutrition+ or Specialty Chemicals+. Relevant to Bühler, FrieslandCampina. B2B model. PASS pre-screen but lower match.",
        "pipedrive_status": "New",
    },
    {
        "name": "Eco Aquaculture Asia",
        "description": "Sustainable fish feed formula and land-based aquaculture systems",
        "website": "Unknown",
        "linkedin": "https://www.linkedin.com/company/eco-aquaculture-asia",
        "stage": "Unknown",
        "geography": "Thailand",
        "score": 5.5,
        "source": "LinkedIn",
        "notes": "Aquaculture feed. Food/Nutrition+ sector. Tangentially relevant (feed vs human nutrition). Possible FrieslandCampina relevance. B2B model. MARGINAL pre-screen (feed not core focus).",
        "pipedrive_status": "New",
    },
    {
        "name": "Bioactivx",
        "description": "Regenerative implants for biomedical applications",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Seed",
        "geography": "Singapore",
        "score": 6.0,
        "source": "News Sites",
        "notes": "Biomedical polymers (regenerative implants). Advanced Materials+ sector. Relevant to Nouryon (specialty materials). B2B model. PASS pre-screen (biomedical polymers match).",
        "pipedrive_status": "New",
    },
    {
        "name": "FoodPlant Pte Ltd",
        "description": "Shared food production facility with pilot scale equipment for food innovation",
        "website": "Unknown",
        "linkedin": "https://sg.linkedin.com/company/foodplant",
        "stage": "Unknown",
        "geography": "Singapore",
        "score": 5.0,
        "source": "LinkedIn",
        "notes": "Shared facility/infrastructure. Food manufacturing. Not a product company. FAIL pre-screen (not a startup, infrastructure provider).",
        "pipedrive_status": "New",
    },
    {
        "name": "Natural Wellness Group",
        "description": "Supplement formulation for OTC, dietary supplements, and pharmaceuticals",
        "website": "Unknown",
        "linkedin": "https://www.linkedin.com/company/naturalwellness",
        "stage": "Unknown",
        "geography": "Malaysia",
        "score": 5.0,
        "source": "LinkedIn",
        "notes": "Supplement formulation. Food/Nutrition+. Possibly B2C focused. Lower relevance. MARGINAL pre-screen (possible B2C, not core focus).",
        "pipedrive_status": "New",
    },
    {
        "name": "Anomaly Bio",
        "description": "Microbial engineering platform for biotech applications",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Pre-seed",
        "geography": "Singapore",
        "score": 6.0,
        "source": "News Sites",
        "notes": "Microbial engineering. Could apply to fermentation/preservation. Sector depends on application (Food/Specialty Chemicals). Relevant if food-focused. B2B model. PASS pre-screen but uncertain application.",
        "pipedrive_status": "New",
    },
    {
        "name": "Life3 Biotech",
        "description": "Biotech company (details unknown)",
        "website": "Unknown",
        "linkedin": "Unknown",
        "stage": "Unknown",
        "geography": "Singapore",
        "score": 4.0,
        "source": "News Sites",
        "notes": "Insufficient data. FAIL pre-screen (no detail on sector/relevance).",
        "pipedrive_status": "New",
    },
]

def main():
    # Separate by status
    lost = [c for c in companies if c["pipedrive_status"] == "Lost"]
    new = [c for c in companies if c["pipedrive_status"] == "New"]
    passed = [c for c in new if c.get("score", 0) >= 6.0 and "PASS pre-screen" in c.get("notes", "")]

    print(f"Total companies: {len(companies)}")
    print(f"  Lost in Pipedrive: {len(lost)}")
    print(f"  New: {len(new)}")
    print(f"    Passed pre-screen: {len(passed)}")
    print(f"    Failed/Marginal pre-screen: {len(new) - len(passed)}")

    print("\n--- PASSED PRE-SCREEN (for icos-fit-eval) ---")
    for c in passed:
        print(f"  ✓ {c['name']} ({c['geography']}) — Score: {c['score']}")

    print("\n--- FAILED/MARGINAL PRE-SCREEN ---")
    failed = [c for c in new if c.get("score", 0) < 6.0 or "PASS pre-screen" not in c.get("notes", "")]
    for c in failed:
        print(f"  ✗ {c['name']} ({c['geography']}) — {c['notes'][:60]}")

    print("\n--- LOST IN PIPEDRIVE (greyed out) ---")
    for c in lost:
        print(f"  ⊗ {c['name']} ({c['geography']}) — {c['notes'][:60]}")

    return companies

if __name__ == "__main__":
    companies = main()
