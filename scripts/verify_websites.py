"""
Deterministic website verification — the last line of defense before results
are stored. The prompt rules stop the LLM from *guessing* domains; this layer
catches what rules can't: typos, dead/parked domains, and redirects to a
different canonical domain.

Policy (conservative — a wrong link is worse than a blank, but bot-blocks and
JS-only pages must not nuke good links):
  - unreachable (DNS/connection failure on https AND http) -> BLANK the website
  - HTTP >= 400 / timeout                                   -> keep, note "unverified"
  - 200 but company name nowhere in the HTML                -> keep, note "unverified"
  - 200 + name found + redirect landed on another domain    -> rewrite to the
    canonical (redirect target) domain

Used by finish_run(); also runnable standalone:
    python -m scripts.verify_websites acme.com "Acme Bio" vernaio.com Vernaio
"""
from __future__ import annotations

import re
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

import requests

TIMEOUT = 10
MAX_WORKERS = 8
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                     "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")}

# Hosts that are NEVER a company's own website. If one of these got stored in the
# website field (e.g. a Crunchbase profile URL used as the site), it's wrong — blank
# it deterministically so a bad link never survives, regardless of the LLM pass.
NON_OWN_SITE_HOSTS = {
    "crunchbase.com", "linkedin.com", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "youtube.com", "pitchbook.com", "dealroom.co", "tracxn.com",
    "cbinsights.com", "wikipedia.org", "medium.com", "github.com", "angel.co",
    "wellfound.com", "f6s.com", "startupintros.com", "leadsontrees.com",
    "techcrunch.com", "sifted.eu", "tech.eu",
}


def _is_non_own_site(domain: str) -> bool:
    d = _norm_domain(domain)
    return any(d == h or d.endswith("." + h) for h in NON_OWN_SITE_HOSTS)


def _norm_domain(raw: str) -> str:
    s = (raw or "").strip().lower()
    for p in ("https://", "http://"):
        if s.startswith(p):
            s = s[len(p):]
    if s.startswith("www."):
        s = s[4:]
    return s.split("/")[0].strip()


def _name_tokens(name: str) -> list[str]:
    """Tokens that count as 'the company is named on this page'."""
    clean = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    words = [w for w in clean.split() if len(w) >= 4
             and w not in ("technologies", "technology", "solutions", "systems",
                           "company", "group", "labs", "holding")]
    collapsed = re.sub(r"[^a-z0-9]", "", (name or "").lower())
    toks = words[:2]
    if len(collapsed) >= 5:
        toks.append(collapsed)
    return toks or ([collapsed] if collapsed else [])


def check_website(domain: str, company_name: str) -> dict:
    """Returns {status: ok|rewrite|unverified|dead|blocked, domain, note}."""
    dom = _norm_domain(domain)
    if not dom or "." not in dom:
        return {"status": "dead", "domain": "", "note": "invalid domain"}
    # A directory/social/news host is never the company's own site — blank it.
    if _is_non_own_site(dom):
        return {"status": "blocked", "domain": "", "note": f"{dom} is a directory/social page, not the company site"}

    resp = None
    for scheme in ("https", "http"):
        try:
            resp = requests.get(f"{scheme}://{dom}", headers=UA,
                                timeout=TIMEOUT, allow_redirects=True)
            break
        except requests.exceptions.Timeout:
            return {"status": "unverified", "domain": dom, "note": "timeout"}
        except requests.exceptions.RequestException:
            continue  # try http fallback, else fall through to dead
    if resp is None:
        return {"status": "dead", "domain": dom, "note": "unreachable"}

    if resp.status_code >= 400:
        return {"status": "unverified", "domain": dom, "note": f"HTTP {resp.status_code}"}

    page = re.sub(r"[^a-z0-9]", "", resp.text[:200_000].lower())
    named = any(re.sub(r"[^a-z0-9]", "", t) in page for t in _name_tokens(company_name))
    final_dom = _norm_domain(urlparse(resp.url).netloc)

    if not named:
        return {"status": "unverified", "domain": dom, "note": "company name not found on homepage"}
    if final_dom and final_dom != dom:
        return {"status": "rewrite", "domain": final_dom, "note": f"redirects to {final_dom}"}
    return {"status": "ok", "domain": dom, "note": ""}


def verify_companies(companies: list[dict]) -> list[dict]:
    """Verify every company's website in place. Never raises."""
    targets = [(i, c) for i, c in enumerate(companies) if (c.get("website") or "").strip()]
    if not targets:
        return companies

    def run_one(pair):
        i, c = pair
        try:
            return i, check_website(c["website"], c.get("name", ""))
        except Exception as e:  # absolute backstop — verification must not kill a run
            return i, {"status": "unverified", "domain": _norm_domain(c["website"]),
                       "note": f"check error: {e}"}

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        results = list(ex.map(run_one, targets))

    stats = {"ok": 0, "rewrite": 0, "unverified": 0, "dead": 0, "blocked": 0}
    for i, res in results:
        c = companies[i]
        stats[res["status"]] += 1
        if res["status"] == "dead":
            c["website"] = ""
            note = "Website removed: unreachable"
        elif res["status"] == "blocked":
            c["website"] = ""
            note = f"Website removed: {res['note']}"
        elif res["status"] == "rewrite":
            c["website"] = res["domain"]
            note = ""
        elif res["status"] == "unverified":
            note = f"Website unverified: {res['note']}"
        else:
            note = ""
        if note:
            c["notes"] = f"{c['notes']} | {note}" if c.get("notes") else note
    print(f"[verify_websites] {stats['ok']} ok, {stats['rewrite']} canonicalized, "
          f"{stats['unverified']} kept-unverified, {stats['dead']} blanked, "
          f"{stats['blocked']} directory-hosts blanked")
    return companies


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or len(args) % 2:
        print("Usage: python -m scripts.verify_websites <domain> <company name> [...]")
        sys.exit(2)
    for d, n in zip(args[::2], args[1::2]):
        print(d, "->", check_website(d, n))
