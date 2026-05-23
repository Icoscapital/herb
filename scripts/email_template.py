"""Email template variable substitution.

Templates use placeholders like [slug], [first name], [N], etc.
This module provides the substitute() function to fill them in.

Usage:
    from scripts.email_template import substitute
    body = substitute("T2", slug="2026-05-09-enzyme-design", first_name="Alice", ...)
"""
from __future__ import annotations
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_template(template_name: str) -> str:
    """Load a template from references/email-templates.md.

    Args:
        template_name: e.g. "T1", "T2", "T3", etc.

    Returns:
        The template body (subject + body) without the name heading.
    """
    path = REPO_ROOT / "references" / "email-templates.md"
    content = path.read_text(encoding="utf-8")

    # Find the template section: ## T<N> — ...
    pattern = rf"## {re.escape(template_name)} —.*?\n(.*?)(?=\n## |$)"
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        raise ValueError(f"Template {template_name} not found")

    return match.group(1).strip()


def substitute(template_name: str, **kwargs: str) -> tuple[str, str]:
    """Load a template and substitute variables.

    Args:
        template_name: e.g. "T2"
        **kwargs: variables to substitute, e.g. slug="2026-05-09-enzyme-design"

    Returns:
        (subject, body) tuple
    """
    template = load_template(template_name)

    # Split subject and body
    # Subject is on the line "**Subject:** ..."
    # Body is everything after
    subject_match = re.search(r"\*\*Subject:\*\* (.+?)(?:\n|$)", template)
    if not subject_match:
        raise ValueError(f"No subject line in template {template_name}")

    subject = subject_match.group(1)

    # Find where body starts (after the subject line and To/From lines)
    body_start = template.find("\n", subject_match.end()) + 1
    # Skip past **To:** and **From:** lines if present
    while body_start < len(template):
        line = template[body_start:template.find("\n", body_start)]
        if line.startswith("**To:**") or line.startswith("**From:**"):
            body_start = template.find("\n", body_start) + 1
        else:
            break

    body = template[body_start:].strip()

    # Substitute variables: [key] -> value
    for key, value in kwargs.items():
        body = body.replace(f"[{key}]", str(value))
        subject = subject.replace(f"[{key}]", str(value))

    # Warn about unsubstituted placeholders
    remaining = re.findall(r"\[([^\]]+)\]", body)
    if remaining:
        print(f"WARNING: unsubstituted placeholders in {template_name}: {remaining}")

    return subject, body


if __name__ == "__main__":
    # Test: load and print T2
    subject, body = substitute(
        "T2",
        slug="2026-05-09-enzyme-design",
        first_name="Alice",
        theme="enzyme design",
        keywords="enzyme, biocatalysis",
        stage="Series A"
    )
    print("Subject:", subject)
    print("\nBody:")
    print(body)
