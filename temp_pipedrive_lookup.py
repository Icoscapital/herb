#!/usr/bin/env python3
"""Cross-check companies against Pipedrive"""

import json
import os
import time
from scripts.pipedrive_client import PipedriveClient

# Initialize Pipedrive client
domain = os.getenv("PIPEDRIVE_DOMAIN", "icoscapital")
token = os.getenv("PIPEDRIVE_TOKEN", "")
pd = PipedriveClient(domain, token)

# Load deduped companies
with open('/home/runner/work/herb/herb/temp_companies_deduped.json', 'r') as f:
    companies = json.load(f)

print(f"Checking {len(companies)} companies against Pipedrive in batches of 5...")

# Process in batches
batch_size = 5
for i in range(0, len(companies), batch_size):
    batch = companies[i:i+batch_size]
    print(f"\nBatch {i//batch_size + 1}: Companies {i+1}-{min(i+batch_size, len(companies))}")

    for company in batch:
        name = company["name"]
        try:
            # Search for organization by name
            results = pd.search_organizations(name, exact=False)

            if results:
                # Found a match - get details
                org = results[0]
                org_id = org.get("id")
                org_name = org.get("name")

                # Get all deals for this org
                deals = pd.list_all_deals_for_org(org_id)

                if deals:
                    # Get most recent deal
                    latest_deal = deals[0]
                    status = latest_deal.get("status", "Unknown")
                    stage_name = latest_deal.get("stage_name", "Unknown")
                    lost_reason = latest_deal.get("lost_reason", None)
                    update_time = latest_deal.get("update_time", "Unknown")

                    # Format status
                    if status == "open":
                        pd_status = f"Open deal — {stage_name}"
                    elif status == "won":
                        pd_status = f"Won — {update_time}"
                    elif status == "lost":
                        pd_status = f"Lost — {update_time}"
                        if lost_reason:
                            pd_status += f" ({lost_reason})"
                    else:
                        pd_status = "Unknown"

                    company["pipedrive_status"] = pd_status
                    company["pipedrive_org_name"] = org_name
                    company["pipedrive_lost_reason"] = lost_reason
                    company["pipedrive_local_lost_date"] = update_time if status == "lost" else None

                    print(f"  ✓ {name} -> {pd_status}")
                else:
                    company["pipedrive_status"] = "New"
                    company["pipedrive_org_name"] = org_name
                    print(f"  ○ {name} -> New (org exists, no deals)")
            else:
                company["pipedrive_status"] = "New"
                print(f"  • {name} -> New")

        except Exception as e:
            print(f"  ✗ {name} -> Error: {e}")
            company["pipedrive_status"] = "New"

    # Small delay between batches
    if i + batch_size < len(companies):
        time.sleep(1)

# Save results
with open('/home/runner/work/herb/herb/temp_companies_with_pipedrive.json', 'w') as f:
    json.dump(companies, f, indent=2)

# Summary
new_count = sum(1 for c in companies if c.get("pipedrive_status") == "New")
open_count = sum(1 for c in companies if c.get("pipedrive_status", "").startswith("Open"))
won_count = sum(1 for c in companies if c.get("pipedrive_status", "").startswith("Won"))
lost_count = sum(1 for c in companies if c.get("pipedrive_status", "").startswith("Lost"))

print(f"\n" + "="*60)
print(f"Pipedrive cross-check complete!")
print(f"  New: {new_count}")
print(f"  Open deals: {open_count}")
print(f"  Won: {won_count}")
print(f"  Lost: {lost_count}")
print(f"  Total: {len(companies)}")
print(f"="*60)
