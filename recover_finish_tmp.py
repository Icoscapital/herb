import time
from scripts.run_web_mandate import _get_sb
from scripts.herb_web_run import mark_done, mark_emailed
from scripts.email_send import send_email

run_id = "8b84cb8c-0394-43fb-a548-ca0361880cf3"
sb = _get_sb()

# Re-assert DONE (result_count/duration already correct from the earlier attempt,
# but status is currently ERROR after the broken EMAILING transition).
mark_done(run_id, 9, 1386)

theme = "Please find companies which are utilizing AI for bathroom products, for example smart mirrors including apps about hair growth/hair loss, AI sensors for toilet cleanness, or any other sensors that can be placed in a bathroom and uses AI or AI-derived functionalities. Find seed, series A or series B start-ups."
submitted_by_email = "em@icoscapital.com"
submitted_by_name = "Eszter Madai"
n_companies = 9

summary = (
    "EU_ONLY mode, geography=Europe. Ran Herb memory + Pipedrive CRM (1 relevant hit: Skinive, "
    "prior Lost deal) + Crunchbase/X/LinkedIn/Conferences/Web + full scrape of all 103 EU VC funds "
    "with a portfolio URL on the curated EU roster (17 batches, 0 additional companies found via "
    "VC portfolios -- this niche sits outside what EU deeptech/industrial/climate funds invest in). "
    "9 companies on the longlist. Note: this theme (AI bathroom/personal-care hardware) falls "
    "outside Icos's core ICF thesis sectors (Food/Nutrition, Specialty Chemicals, Advanced "
    "Materials, Industry AI, CCUS) and has no LP relevance (Nouryon/Buhler/FrieslandCampina), so "
    "every company fails the standard pre-screen gate on sector/LP fit -- flagged accordingly on "
    "each row rather than excluded, since the mandate explicitly asked for this vertical. "
    "No seed companies were provided for a recall check, and this is not a watch run."
)

first_name = (submitted_by_name.split() or ["there"])[0]
dashboard_url = f"https://herb-tau.vercel.app/dashboard/mandates/{run_id}"
subject = f"Herb -- Results ready: {theme[:50]}"
summary_block = f"{summary.strip()}\n\n" if summary and summary.strip() else ""
body = (
    f"Hi {first_name},\n\n"
    "Your Herb search is complete.\n\n"
    f"Theme:   {theme}\n"
    f"Results: {n_companies} companies\n\n"
    f"{summary_block}"
    "View the full longlist here:\n"
    f"{dashboard_url}\n\n"
    "Best,\nHerb"
)

send_email(submitted_by_email, subject, body)
mark_emailed(run_id)
print("EMAILED OK")

import os
os.system(f'python -m scripts.git_state commit "web mandate {run_id} complete"')
