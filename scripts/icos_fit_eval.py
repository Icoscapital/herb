"""Icos Fit Evaluation stub.

This is a placeholder for the full icos-fit-eval evaluator.
In production, this would spawn sub-agents to score companies.
For now, it generates a basic scorecard so Route E doesn't break.

Usage:
    from scripts.icos_fit_eval import generate_scorecard
    scorecard_md = generate_scorecard(company_name, domain, mandate_context)
"""
from __future__ import annotations
from datetime import datetime


def generate_scorecard(
    company_name: str,
    domain: str,
    mandate_context: dict | None = None,
) -> str:
    """Generate a basic scorecard markdown.

    Args:
        company_name: e.g. "Acme Bio"
        domain: e.g. "acme-bio.com"
        mandate_context: dict with theme, keywords, geography, stage (optional)

    Returns:
        Markdown scorecard text.
    """
    if mandate_context is None:
        mandate_context = {}

    theme = mandate_context.get("theme", "Unknown")
    date = datetime.utcnow().strftime("%Y-%m-%d")

    scorecard = f"""# Icos Fit Evaluation — {company_name}

**Evaluated:** {date}
**Domain:** {domain}
**Mandate:** {theme}

## Quick Assessment

This is a preliminary evaluation pending full icos-fit-eval implementation.

### Alignment
- **Theme fit:** Matches mandate ({theme})
- **Stage alignment:** Likely target stage
- **Geography:** Europe-focused

### Signals
- **Revenue:** Unknown
- **Traction:** Pre-screen passed
- **Team:** No data yet

## Overall Score

**Placeholder: 6.5 / 10**

This company passed the Level 1 pre-screen and is a candidate for deeper evaluation.
Full evaluation pending implementation of icos-fit-eval agents.

## Next Steps

1. Schedule founder call
2. Request additional data (financials, cap table)
3. Competitive analysis
4. Customer validation

---

**Note:** This is a stub evaluation. Full icos-fit-eval with detailed scoring coming soon.
"""
    return scorecard


if __name__ == "__main__":
    # Test
    card = generate_scorecard(
        "Acme Bio",
        "acme-bio.com",
        {"theme": "enzyme design", "stage": "Series A"}
    )
    print(card)
