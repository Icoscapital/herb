"""Herb email sender — Microsoft Graph API.

Cloud port: reads creds from environment variables.
"""
from __future__ import annotations
import base64
import os
import sys

import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
DEFAULT_MAILBOX = "herb@icoscapital.com"


def _required(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        sys.stderr.write(f"ERROR: required env var not set: {name}\n")
        sys.exit(1)
    return v


def _get_token() -> tuple[str, str]:
    tenant = _required("GRAPH_TENANT_ID")
    client_id = _required("GRAPH_CLIENT_ID")
    client_secret = _required("GRAPH_CLIENT_SECRET")
    mailbox = os.environ.get("HERB_MAILBOX", DEFAULT_MAILBOX)
    resp = requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"], mailbox


def send_email(to_address: str, subject: str, body_text: str,
               attachments: list[dict] | None = None) -> None:
    """Send a plain-text email from the herb mailbox.

    attachments: list of {"filename": str, "content_bytes": bytes}
    """
    token, mailbox = _get_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    message = {
        "subject": subject,
        "body": {"contentType": "Text", "content": body_text},
        "toRecipients": [{"emailAddress": {"address": to_address}}],
    }
    if attachments:
        message["attachments"] = [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": att["filename"],
                "contentBytes": base64.b64encode(att["content_bytes"]).decode(),
            }
            for att in attachments
        ]

    resp = requests.post(
        f"{GRAPH_BASE}/users/{mailbox}/sendMail",
        headers=headers,
        json={"message": message, "saveToSentItems": True},
        timeout=60,
    )
    resp.raise_for_status()


if __name__ == "__main__":
    # CLI smoke test:  python -m scripts.email_send recipient@icoscapital.com
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.email_send <recipient>")
        sys.exit(2)
    send_email(sys.argv[1], "Herb cloud — test email", "Cloud-hosted Graph send is working.")
    print(f"Sent test email to {sys.argv[1]}")
