#!/usr/bin/env python3
"""Process web mandate search results: merge, dedup, Pipedrive check, pre-screen, Icos fit eval."""

import re
from typing import List, Dict, Any
from difflib import SequenceMatcher
from urllib.parse import urlparse

# Raw search results from sub-agents
CRUNCHBASE_RESULTS = """
Addcomposites|Unknown|Finland|Unknown|Unknown|Unknown|Unknown|Plug & play composites production|Advanced Composites|https://www.crunchbase.com/organization/addcomposites|First plug & play solution
Advanced Composites|Unknown|Italy|Unknown|Unknown|Unknown|Unknown|Composite centralizers & oilfield products|Advanced Composites|https://www.crunchbase.com/organization/advanced-composites|Downhole application
Suprem|Unknown|Switzerland|Unknown|Unknown|Unknown|Unknown|Thermoplastic composites, tape, profile, rods, fibers|Advanced Materials|https://www.crunchbase.com/organization/suprem-3a16|Additive manufacturing
FibreCoat|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Thermoplastic-coated fibers, aluminum-coated fibers|Fiber Coatings|https://www.crunchbase.com/organization/fibrecoat-gmbh|Composite shielding
Fiber Plast|Unknown|Italy|Unknown|Unknown|Unknown|Unknown|Fiberglass reinforced thermoplastic pipes & tanks|Composites|https://www.crunchbase.com/organization/fiber-plast|Tank manufacturing
Composite Braiding|Unknown|United Kingdom|Unknown|Unknown|Unknown|Unknown|Carbon, glass, aramid, basalt fiber braiding|Advanced Composites|https://www.crunchbase.com/organization/composite-braiding|Lightweight composite
MLPlastics|Unknown|Germany|Unknown|Unknown|Unknown|Unknown|Dryflex Green TPE (90% renewable), masterbatches|TPE|https://www.crunchbase.com/organization/mlplastics|Biobased TPE
Tecno Plastic Engineering|Unknown|Italy|Unknown|Unknown|Unknown|Unknown|Plastic & thermoplastic materials|Engineering Plastics|https://www.crunchbase.com/organization/tecno-plastic-engineering|Thermoplastic specialization
Polyplast|Unknown|Germany|Unknown|Unknown|Unknown|Unknown|TPE-S compounds, refined plastic granulates|TPE|https://www.crunchbase.com/organization/polyplast-gmbh|High reverse-bending
Conductive Composites|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Conductive polymer composite systems|Advanced Composites|https://www.crunchbase.com/organization/conductive-composites|Conductivity materials
Vannplastic|Unknown|United Kingdom|Unknown|Unknown|Unknown|Unknown|WPC (Wood Polymer Composite)|Sustainable Composites|https://www.crunchbase.com/organization/vannplastic-dba-ecodek|Timber alternative
3A Composites Display Europe|Unknown|Germany|Unknown|Unknown|Unknown|Unknown|Acrylic, aluminum composite, polycarbonate sheets|Advanced Materials|https://www.crunchbase.com/organization/3a-composites-display-europe|Lightweight foam board
"""

LINKEDIN_RESULTS = """
Veplas d.d.|Unknown|Slovenia|Unknown|Unknown|Unknown|Unknown|Fiber reinforced plastics (FRP)|Automotive|https://si.linkedin.com/company/veplas-d-d|European FRP leader
Hanwha Advanced Materials Europe|Unknown|Germany|Unknown|Unknown|Unknown|Unknown|Fiber reinforced automotive parts, solar|Automotive|https://www.linkedin.com/company/hanwha-advanced-materials-europe|Lightweight components
Mingfeng Composite Europe B.V.|Unknown|Netherlands|Unknown|Unknown|Unknown|Unknown|FRP production|Industrial composites|https://www.linkedin.com/company/nanjing-mingfeng-composite-materials|European FRP
Advanced Composites Solutions Srl|Unknown|Romania|Unknown|Unknown|Unknown|Unknown|Advanced composite production|Industrial components|https://www.linkedin.com/company/advanced-composites-solutions-s-r-l-|Design to production
Finite Fiber|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Natural and synthetic cut fibers, pulps|Rubber, plastics|https://www.linkedin.com/company/finite-fiber|Industry diversification
Future Comp LLC|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|FUSIONFIBER thermoplastic process|Advanced manufacturing|https://www.linkedin.com/company/future-comp|Thermoset replacement
EREZ TECHNICAL TEXTILES|Unknown|Israel|Unknown|Unknown|Unknown|Unknown|Polymer membranes, reinforced fabrics|Industrial textiles|https://il.linkedin.com/company/erez-thermoplastic-productc|Market leader
Polygreen Group|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Biodegradable superabsorbent materials|Hygiene|https://www.linkedin.com/company/polygreen|100% biodegradable
CE PoliMaT|Unknown|Slovenia|Unknown|Unknown|Unknown|Unknown|Polymer materials technology transfer|Materials science|https://www.linkedin.com/company/ce-polimat-center-of-excellence-for-polymer-materials-and-technologies|Academic-industry
POLYMAT|Unknown|Spain|Unknown|Unknown|Unknown|Unknown|Polymer synthesis and assembly|Research|https://www.linkedin.com/company/basque-center-for-macromolecular-design-and-engineering-polymat-fundazioa|Basque innovation
Polykemi AB|Unknown|Sweden|Unknown|Unknown|Unknown|Unknown|Polymer material consulting|Sustainability|https://www.linkedin.com/company/polykemi-ab|Sustainability expertise
SPECIFIC POLYMERS|Unknown|France|Unknown|Unknown|Unknown|Unknown|Bisphenol-free biobased epoxy resins|Advanced materials|https://www.linkedin.com/company/specific-polymers/|EU-funded CUBIC
Creative Composites|Unknown|UK|Unknown|Unknown|Unknown|Unknown|Advanced composite components|Engineering|https://uk.linkedin.com/company/creative-composites|Northern Ireland
PRF Composite Materials|Unknown|UK|Unknown|Unknown|Unknown|Unknown|Prepreg, reinforcements, epoxy systems|High-performance|https://uk.linkedin.com/company/prf-composite-materials|Market leader
Polymer Compounders Limited|Unknown|UK|Unknown|Unknown|Unknown|Unknown|Thermoplastic compounds|Industrial polymers|https://uk.linkedin.com/company/polymer-compounders-ltd|UK leading compounder
Concordia Engineered Fibers|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Thermoplastics and composites in fiber forms|Specialty fibers|https://www.linkedin.com/company/concordia-fibers|Engineered fiber
"""

CONFERENCE_RESULTS = """
KUORI|Unknown|Switzerland|Series A|€2.3M|Unknown|Unknown|Bio-based biodegradable materials from food byproducts|Sustainable Materials|Unknown|Renewable Material 2023
Antefil Composite Tech|Unknown|Switzerland|Series A|€1.8M|Unknown|Unknown|Micro-engineered hybrid fibres with recyclable plastic|Lightweight Structures|Unknown|JEC finalist
Jokey|Unknown|Germany|Series B|Unknown|Unknown|Unknown|Rigid plastic packaging with PCR buckets|Sustainable Packaging|Unknown|Sika Challenge 2023
BioGear|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Carbon and flax-fiber-reinforced composites|Composites|Unknown|JEC World 2024-2025
"""

NEWS_RESULTS = """
Fairmat|fairmat.tech|France|Series B|$29.77M|April 2025|Unknown|Carbon fiber composites recycling|Advanced Composites|https://sifted.eu/scout/advanced-materials-q3-2024|Novel recycling April 2025
CuspAI|Unknown|Unknown|Seed|Unknown|2024|Unknown|AI-powered materials discovery platform|Advanced Materials|https://sifted.eu/scout/advanced-materials-q3-2024|Materials search 2024
Strong by Form|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Wood-strand composites|Advanced Composites|https://sifted.eu/scout/advanced-materials-q3-2024|Steel/aluminum replacement
Apheros|Unknown|Switzerland|Unknown|Unknown|Unknown|Unknown|Novel metal foam products|Advanced Materials|https://sifted.eu/scout/advanced-materials-q3-2024|ETH Zurich spinout
Polaron|Unknown|UK|Unknown|Unknown|Unknown|Unknown|Graphene materials|Advanced Materials|https://sifted.eu/scout/advanced-materials-q3-2024|Graphene energy storage
Ecoat|Unknown|France|Series A|€21M|April 2025|Unknown|Water-based bio-polymers for coatings|Sustainable Polymers|https://www.eu-startups.com/2025/04/ecoat-secures-e21-million|Bio-polymers April 2025
Fibersail|Unknown|Portugal|Series A|€5M|2022|Unknown|Fiber optic sensors|High-Performance Fibers|https://www.eu-startups.com/directory/fibersail/|Wind energy fiber
High Temperature Material Systems|Unknown|UK|Pre-Series A|€1.5M|2025|Unknown|Advanced heat-resistant polymers|Engineering Thermoplastics|https://www.eu-startups.com/directory/fibersail/|Thermal-resistant 2025
Ökosix|Unknown|Unknown|Seed|$2.3M|2025|Angel investors|Bio-based polymers|Sustainable Polymers|https://techcrunch.com/2025/10/06/okosix-will-show-its-biodegradable-plastic-at-techcrunch-disrupt-2025/|Biodegradable 2025
"""

ACCELERATOR_RESULTS = """
Altrove|Unknown|France|Unknown|Unknown|Unknown|Unknown|AI models, lab automation for net zero|Net Zero alternatives|Unknown|Materials security
Syntetica|Unknown|France|Seed|€4.2M|2023|EQT Ventures|Green chemistry for recycled nylon|Sustainable Polymers|Unknown|Circular fashion 2023
Rheom Materials|Unknown|Unknown|Unknown|Unknown|Unknown|Unknown|Phage/bio-based materials for leather alternatives|Biopolymer resins|Unknown|Sustainable material
"""

PLANET_A_RESULTS = """
traceless|Unknown|Unknown|Unknown|Unknown|Unknown|Planet A Ventures|Novel compostable materials|Sustainable polymers|Unknown|Compostable packaging
one • five|Unknown|Unknown|Unknown|Unknown|Unknown|Planet A Ventures|Paper & novel bioplastics|Sustainable polymers|Unknown|Single-use plastics
WILDPLASTIC|Unknown|Unknown|Unknown|Unknown|Unknown|Planet A Ventures|Plastic recovery & upcycling|Recycled polymers|Unknown|Circular plastic
"""


def parse_pipe_delimited(data: str, source: str) -> List[Dict[str, Any]]:
    """Parse pipe-delimited data into list of dicts."""
    companies = []
    for line in data.strip().split('\n'):
        if not line.strip():
            continue

        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 10:
            continue

        company = {
            'name': parts[0],
            'domain': parts[1] if parts[1] != 'Unknown' else '',
            'hq_country': parts[2] if parts[2] != 'Unknown' else '',
            'stage': parts[3] if parts[3] != 'Unknown' else '',
            'raised': parts[4] if parts[4] != 'Unknown' else '',
            'last_round': parts[5] if parts[5] != 'Unknown' else '',
            'investors': parts[6] if parts[6] != 'Unknown' else '',
            'tech': parts[7] if parts[7] != 'Unknown' else '',
            'sectors': parts[8] if parts[8] != 'Unknown' else '',
            'url': parts[9] if parts[9] != 'Unknown' else '',
            'why_now': parts[10] if len(parts) > 10 and parts[10] != 'Unknown' else '',
            'source': source
        }
        companies.append(company)

    return companies


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    if not url:
        return ''
    try:
        parsed = urlparse(url if url.startswith('http') else f'https://{url}')
        domain = parsed.netloc or parsed.path
        # Remove www.
        domain = re.sub(r'^www\.', '', domain)
        # Remove trailing /
        domain = domain.rstrip('/')
        return domain
    except:
        return ''


def fuzzy_match(s1: str, s2: str) -> float:
    """Return similarity ratio between two strings."""
    return SequenceMatcher(None, s1.lower(), s2.lower()).ratio()


def merge_and_dedup(companies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge companies and deduplicate by domain/name."""
    deduped = []
    seen_domains = {}
    seen_names = {}

    for company in companies:
        # Extract domain if not provided
        if not company['domain'] and company['url']:
            company['domain'] = extract_domain(company['url'])

        # Normalize domain
        domain = company['domain'].lower().strip() if company['domain'] else ''
        name = company['name'].lower().strip()

        # Check for domain match
        if domain and domain in seen_domains:
            # Merge - keep most complete record
            idx = seen_domains[domain]
            existing = deduped[idx]

            # Merge sources
            if company['source'] not in existing['source']:
                existing['source'] = f"{existing['source']}, {company['source']}"

            # Fill in missing fields
            for field in ['hq_country', 'stage', 'raised', 'last_round', 'investors', 'tech', 'sectors', 'why_now']:
                if not existing[field] and company[field]:
                    existing[field] = company[field]

            continue

        # Check for fuzzy name match (>85%) if no domain
        if not domain:
            matched = False
            for seen_name, idx in seen_names.items():
                if fuzzy_match(name, seen_name) > 0.85:
                    # Merge
                    existing = deduped[idx]
                    if company['source'] not in existing['source']:
                        existing['source'] = f"{existing['source']}, {company['source']}"

                    # Fill missing fields
                    for field in ['domain', 'hq_country', 'stage', 'raised', 'last_round', 'investors', 'tech', 'sectors', 'why_now']:
                        if not existing[field] and company[field]:
                            existing[field] = company[field]

                    matched = True
                    break

            if matched:
                continue

        # New company
        deduped.append(company)
        if domain:
            seen_domains[domain] = len(deduped) - 1
        seen_names[name] = len(deduped) - 1

    return deduped


def main():
    """Main processing function."""
    # Parse all search results
    all_companies = []

    all_companies.extend(parse_pipe_delimited(CRUNCHBASE_RESULTS, 'Crunchbase'))
    all_companies.extend(parse_pipe_delimited(LINKEDIN_RESULTS, 'LinkedIn'))
    all_companies.extend(parse_pipe_delimited(CONFERENCE_RESULTS, 'Conferences'))
    all_companies.extend(parse_pipe_delimited(NEWS_RESULTS, 'News Sites'))
    all_companies.extend(parse_pipe_delimited(ACCELERATOR_RESULTS, 'Accelerators'))
    all_companies.extend(parse_pipe_delimited(PLANET_A_RESULTS, 'Planet A Ventures'))

    print(f"Parsed {len(all_companies)} companies from search results")

    # Load attachment companies
    import sys
    sys.path.insert(0, '/home/runner/work/herb/herb')
    from scripts.run_web_mandate import start_run

    ctx = start_run()

    # Convert attachment companies to same format
    for att_company in ctx['additional_companies']:
        company = {
            'name': att_company['name'],
            'domain': extract_domain(att_company['domain']) if att_company.get('domain') else '',
            'hq_country': '',
            'stage': '',
            'raised': '',
            'last_round': '',
            'investors': '',
            'tech': '',
            'sectors': '',
            'url': att_company['domain'] if att_company.get('domain') else '',
            'why_now': '',
            'source': att_company['source']
        }
        all_companies.append(company)

    print(f"Total companies (with attachments): {len(all_companies)}")

    # Dedup
    deduped = merge_and_dedup(all_companies)
    print(f"After dedup: {len(deduped)} unique companies")

    # Save to file for next step
    import json
    with open('/tmp/deduped_companies.json', 'w') as f:
        json.dump(deduped, f, indent=2)

    print(f"\nSaved deduped companies to /tmp/deduped_companies.json")
    print(f"\nFirst 5 companies:")
    for i, company in enumerate(deduped[:5]):
        print(f"{i+1}. {company['name']} ({company['domain']}) - {company['hq_country']} - {company['source']}")


if __name__ == '__main__':
    main()
