#!/usr/bin/env python3
"""Prepare final results: pre-screen, format for finish_run."""

import json
import re

def is_europe_or_north_america(country: str) -> bool:
    """Check if country is in Europe or North America."""
    if not country:
        return True  # Unknown, give benefit of doubt

    europe = ['Finland', 'Italy', 'Switzerland', 'Germany', 'United Kingdom', 'UK', 'Slovenia',
              'Netherlands', 'Romania', 'France', 'Spain', 'Sweden', 'Portugal', 'Austria',
              'Belgium', 'Denmark', 'Norway', 'Poland', 'Ireland', 'Czech Republic', 'Greece']
    north_america = ['USA', 'United States', 'Canada', 'US']

    country_lower = country.lower()
    for region in europe + north_america:
        if region.lower() in country_lower:
            return True

    return False  # Israel, Singapore, etc.


def assess_sector_fit(tech: str, sectors: str) -> str:
    """Assess which Icos sector this fits."""
    text = f"{tech} {sectors}".lower()

    # Advanced Materials+ (composites, fibers, polymers)
    if any(kw in text for kw in ['composite', 'fiber', 'fibre', 'polymer', 'thermoplastic',
                                   'tpe', 'elastomer', 'coating', 'material', 'resin', 'epoxy']):
        return 'Advanced Materials+'

    # Specialty Chemicals+
    if any(kw in text for kw in ['chemical', 'synthesis', 'formulation']):
        return 'Specialty Chemicals+'

    # Food/Nutrition+ (some biomaterials companies)
    if any(kw in text for kw in ['food', 'nutrition', 'agriculture']):
        return 'Food/Nutrition+'

    return 'Advanced Materials+'  # Default for this mandate


def assess_stage_fit(stage: str, raised: str) -> tuple[str, bool]:
    """Assess stage and whether it fits Series A/B criteria."""
    if not stage and not raised:
        return ('Unknown', True)  # Give benefit of doubt

    stage_lower = stage.lower() if stage else ''

    # Clear Series A/B
    if 'series a' in stage_lower or 'series b' in stage_lower:
        return (stage, True)

    # Seed - likely too early
    if 'seed' in stage_lower and 'series' not in stage_lower:
        if raised:
            # If they raised €4M+ at seed, might be transitioning to A
            match = re.search(r'[€$](\d+(?:\.\d+)?)\s*M', raised)
            if match and float(match.group(1)) >= 4:
                return ('Seed (high)', True)
        return (stage, False)

    # Pre-seed - too early
    if 'pre-seed' in stage_lower or 'pre-series' in stage_lower:
        return (stage, False)

    # Growth / Series C+ - too late
    if 'growth' in stage_lower or 'series c' in stage_lower or 'mature' in stage_lower:
        return (stage, False)

    # Unknown but has raised capital
    if raised:
        return ('Unknown (funded)', True)

    return (stage or 'Unknown', True)


def extract_description(tech: str, sectors: str, why_now: str) -> str:
    """Create a description from available fields."""
    parts = []
    if tech:
        parts.append(tech)
    if sectors and sectors not in tech:
        parts.append(f"Sectors: {sectors}")
    if why_now:
        parts.append(f"Why now: {why_now}")

    return '. '.join(parts)[:500]  # Limit length


def format_for_finish_run(companies: list) -> list:
    """Format companies for finish_run."""
    results = []

    for company in companies:
        # Geography check
        geo_ok = is_europe_or_north_america(company['hq_country'])

        # Sector fit
        icos_sector = assess_sector_fit(company['tech'], company['sectors'])

        # Stage fit
        stage_normalized, stage_ok = assess_stage_fit(company['stage'], company['raised'])

        # Pre-screen assessment
        pre_screen = 'Pass' if geo_ok and stage_ok else 'Fail'
        fail_reason = []
        if not geo_ok:
            fail_reason.append(f"Geography: {company['hq_country']}")
        if not stage_ok:
            fail_reason.append(f"Stage: {stage_normalized}")

        # Extract domain as website
        website = ''
        if company['domain']:
            website = f"https://{company['domain']}" if not company['domain'].startswith('http') else company['domain']
        elif company['url'] and not 'linkedin.com' in company['url'] and not 'crunchbase.com' in company['url']:
            website = company['url']

        # LinkedIn
        linkedin = ''
        if 'linkedin.com' in (company['url'] or ''):
            linkedin = company['url']

        # Description
        description = extract_description(company['tech'], company['sectors'], company['why_now'])

        # Notes
        notes_parts = [f"Source: {company['source']}"]
        if company['investors']:
            notes_parts.append(f"Investors: {company['investors']}")
        if company['raised']:
            notes_parts.append(f"Raised: {company['raised']}")
        if company['last_round']:
            notes_parts.append(f"Last round: {company['last_round']}")
        notes_parts.append(f"Pre-screen: {pre_screen}")
        if fail_reason:
            notes_parts.append(f"Reason: {', '.join(fail_reason)}")
        notes_parts.append(f"Icos sector: {icos_sector}")

        notes = ' | '.join(notes_parts)

        # Score: higher for Series A/B with recent funding
        score = 5.0  # Default
        if 'Series A' in stage_normalized:
            score = 7.0
        elif 'Series B' in stage_normalized:
            score = 8.0
        elif stage_normalized == 'Seed (high)':
            score = 6.0
        elif not stage_ok:
            score = 3.0

        if not geo_ok:
            score -= 2.0

        if '2024' in company['why_now'] or '2025' in company['why_now'] or '2026' in company['why_now']:
            score += 1.0

        score = max(0.0, min(10.0, score))  # Clamp to 0-10

        result = {
            'name': company['name'],
            'description': description,
            'website': website,
            'linkedin': linkedin,
            'stage': stage_normalized,
            'geography': company['hq_country'] or 'Unknown',
            'score': round(score, 1),
            'source': company['source'],
            'notes': notes
        }

        results.append(result)

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)

    return results


def main():
    """Main function."""
    # Load deduped companies
    with open('/tmp/deduped_companies.json', 'r') as f:
        companies = json.load(f)

    print(f"Loaded {len(companies)} deduped companies")

    # Format for finish_run
    results = format_for_finish_run(companies)

    print(f"\nFormatted {len(results)} companies for results")

    # Save
    with open('/tmp/final_results.json', 'w') as f:
        json.dump(results, f, indent=2)

    # Stats
    pass_count = sum(1 for r in results if 'Pass' in r['notes'])
    fail_count = len(results) - pass_count
    series_ab = sum(1 for r in results if 'Series A' in r['stage'] or 'Series B' in r['stage'])

    print(f"\nStats:")
    print(f"  Pre-screen Pass: {pass_count}")
    print(f"  Pre-screen Fail: {fail_count}")
    print(f"  Series A/B: {series_ab}")
    print(f"  Average score: {sum(r['score'] for r in results) / len(results):.1f}")

    print(f"\nTop 10 companies by score:")
    for i, company in enumerate(results[:10], 1):
        print(f"  {i}. {company['name']} - Score: {company['score']} - {company['stage']} - {company['geography']}")

    print(f"\nSaved to /tmp/final_results.json")


if __name__ == '__main__':
    main()
