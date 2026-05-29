"""
Web mandate orchestration - executes the full search → dedupe → score → finish pipeline.
Called by the workflow or directly by Claude.
"""
from __future__ import annotations
import json
import os
import re
from typing import Any
from difflib import SequenceMatcher

def fuzzy_match(a: str, b: str) -> float:
    """Return similarity ratio 0-1."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def dedupe_companies(companies: list[dict]) -> list[dict]:
    """Dedupe by domain; if domain is Unknown/missing, fuzzy-match names at >0.85."""
    seen_domains = {}
    seen_names = {}
    unique = []

    for c in companies:
        domain = (c.get('domain') or '').strip()
        name = (c.get('name') or '').strip()

        if domain and domain.lower() != 'unknown':
            if domain in seen_domains:
                continue
            seen_domains[domain] = True
        else:
            # Fuzzy match against existing names
            matched = False
            for existing_name in seen_names:
                if fuzzy_match(name, existing_name) > 0.85:
                    matched = True
                    break
            if matched:
                continue
            seen_names[name] = True

        unique.append(c)

    return unique

def parse_pipe_delimited(text: str) -> list[dict]:
    """Parse pipe-delimited text into list of dicts."""
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    companies = []

    for line in lines:
        if '| rate-limited' in line or '| no results' in line:
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 11:
            continue
        companies.append({
            'name': parts[0],
            'domain': parts[1],
            'hq_country': parts[2],
            'stage': parts[3],
            'raised': parts[4],
            'last_round': parts[5],
            'investors': parts[6],
            'tech': parts[7],
            'sectors': parts[8],
            'url': parts[9],
            'why_now': parts[10],
        })

    return companies

def apply_prescreen(company: dict) -> str:
    """Apply pre-screen gate. Returns 'Pass', 'Fail — reason', or 'Skip (existing)'."""
    # Sector check
    valid_sectors = ['Food', 'Nutrition', 'Specialty Chemicals', 'Advanced Materials', 'Industry AI', 'CCUS']
    sectors = company.get('sectors', '')
    has_sector = any(s.lower() in sectors.lower() for s in valid_sectors) if sectors and sectors != 'Unknown' else False

    # Stage check
    stage = company.get('stage', '')
    has_stage = any(s in stage for s in ['Series A', 'Series B']) or stage == 'Unknown'

    # B2B check (heuristic)
    tech = company.get('tech', '')
    is_b2b = 'B2B' in tech or 'enterprise' in tech.lower() or ('B2C' not in tech and tech != 'Unknown')

    # LP fit check
    lp_keywords = ['chemical', 'food', 'nutrition', 'dairy', 'grain', 'agri', 'biotech']
    text_to_check = f"{sectors} {tech}".lower()
    has_lp_fit = any(kw in text_to_check for kw in lp_keywords)

    if not has_sector:
        return 'Fail — sector mismatch'
    if not has_stage:
        return 'Fail — stage mismatch'
    if not is_b2b:
        return 'Fail — B2C'
    if not has_lp_fit:
        return 'Fail — no LP fit'

    return 'Pass'

if __name__ == '__main__':
    # This script is intended to be called by sub-agents or the main workflow,
    # not run directly. The orchestration lives in the workflow script.
    print("This module provides helper functions for the web mandate workflow.")
