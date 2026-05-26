#!/usr/bin/env python3
"""
Batch Pipedrive lookup for web mandate companies.
Returns: {status, lost_reason, local_lost_date, org_name} for each company.
"""
import os
import sys
from scripts.pipedrive_client import PipedriveClient
from scripts.pipedrive_batch import batch_search_organizations

# Company list from web mandate
COMPANIES = [
    "FoodPlant Pte Ltd",
    "Specialty Natural Products",
    "Natural Wellness Group",
    "Algrow Biosciences",
    "PT. Alga Bioteknologi Indonesia",
    "PT Spiralife Bioteknologi Indonesia",
    "Nurasa",
    "CJ Bio Malaysia Sdn Bhd",
    "Eco Aquaculture Asia",
    "Umami Bioworks",
    "Anomaly Bio",
    "Bioactivx",
    "Next Gen Foods",
    "Life3 Biotech",
    "Sophie's Bionutrients",
    "TurtleTree Labs",
]

def get_org_status(client, org_data):
    """Extract status from org and its deals."""
    if not org_data or not org_data.get("id"):
        return {
            "status": "New",
            "lost_reason": None,
            "local_lost_date": None,
            "org_name": None
        }

    org_name = org_data.get("name")
    org_id = org_data["id"]

    # Get all deals for this org
    try:
        all_deals = client.list_all_deals_for_org(org_id)
    except Exception as e:
        print(f"WARN: Failed to fetch deals for {org_name}: {e}", file=sys.stderr)
        all_deals = []

    if not all_deals:
        return {
            "status": "New",
            "lost_reason": None,
            "local_lost_date": None,
            "org_name": org_name
        }

    # Check deal statuses
    won_deals = [d for d in all_deals if d.get("status") == "won"]
    lost_deals = [d for d in all_deals if d.get("status") == "lost"]
    open_deals = [d for d in all_deals if d.get("status") == "open"]

    if won_deals:
        latest_won = won_deals[0]
        return {
            "status": "Won",
            "lost_reason": None,
            "local_lost_date": latest_won.get("won_time", "Unknown"),
            "org_name": org_name
        }

    if lost_deals:
        latest_lost = lost_deals[0]
        return {
            "status": f"Lost — {latest_lost.get('lost_time', 'Unknown')}",
            "lost_reason": latest_lost.get("lost_reason", "Unknown"),
            "local_lost_date": latest_lost.get("lost_time"),
            "org_name": org_name
        }

    if open_deals:
        latest_open = open_deals[0]
        stage_name = latest_open.get("stage_name", "Unknown stage")
        return {
            "status": f"Open deal — {stage_name}",
            "lost_reason": None,
            "local_lost_date": None,
            "org_name": org_name
        }

    return {
        "status": "New",
        "lost_reason": None,
        "local_lost_date": None,
        "org_name": org_name
    }


def main():
    # Get Pipedrive credentials from environment
    domain = os.environ.get("PIPEDRIVE_DOMAIN", "icoscapital")
    api_token = os.environ.get("PIPEDRIVE_TOKEN") or os.environ.get("PIPEDRIVE_API_TOKEN")

    if not api_token:
        print("ERROR: PIPEDRIVE_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    client = PipedriveClient(domain, api_token)

    print("Looking up companies in Pipedrive...")

    # Batch search
    org_results = batch_search_organizations(client, COMPANIES)

    # Get status for each
    statuses = []
    for i, org_data in enumerate(org_results):
        company_name = COMPANIES[i]
        status_data = get_org_status(client, org_data)
        statuses.append({
            "input_name": company_name,
            **status_data
        })

        # Print for logging
        status_str = status_data["status"]
        print(f"{company_name}: {status_str}")

    # Output as pipe-delimited for easy parsing
    print("\n--- RESULTS (pipe-delimited) ---")
    print("InputName|Status|LostReason|LostDate|PipedriveOrgName")
    for s in statuses:
        lost_reason = s["lost_reason"] or "N/A"
        lost_date = s["local_lost_date"] or "N/A"
        org_name = s["org_name"] or "Not Found"
        print(f"{s['input_name']}|{s['status']}|{lost_reason}|{lost_date}|{org_name}")

if __name__ == "__main__":
    main()
