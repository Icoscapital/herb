from scripts.herb_web_run import mark_emailed, _get_sb
from scripts.email_send import send_email

run_id = "c086d3c8-f011-4aea-9ddd-3f29bef374d0"
theme = "Technology to help realize continuous fermentation for industrial biotech companies"
submitted_by_email = "nlal@icoscapital.com"
submitted_by_name = "Nityen Lal | Icos Capital"
result_count = 240

summary = (
    "Recall: 2/2 known companies found by the search (pow.bio and MOA Foodtech both surfaced "
    "independently via Pipedrive CRM).\n\n"
    "Pipedrive cross-check: 145 of 240 candidates were already in our CRM (mostly prior Lost/Open "
    "deals) — expected given Icos's deep prior activity in fermentation/industrial biotech."
)

sb = _get_sb()
existing = sb.table("herb_runs").select("status").eq("id", run_id).single().execute()
status = (existing.data or {}).get("status")
print("current status:", status)

if status == "EMAILED":
    print("already emailed, skipping")
else:
    first_name = (submitted_by_name.split() or ["there"])[0]
    dashboard_url = f"https://herb-tau.vercel.app/dashboard/mandates/{run_id}"
    subject = f"Herb — Results ready: {theme[:50]}"
    body = (
        f"Hi {first_name},\n\n"
        "Your Herb search is complete.\n\n"
        f"Theme:   {theme}\n"
        f"Results: {result_count} companies\n\n"
        f"{summary}\n\n"
        "View the full longlist here:\n"
        f"{dashboard_url}\n\n"
        "Best,\nHerb"
    )
    send_email(submitted_by_email, subject, body)
    mark_emailed(run_id)
    print("emailed and marked EMAILED")

import os
os.system(f'python -m scripts.git_state commit "web mandate {run_id} complete"')
print("DONE")
