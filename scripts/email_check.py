"""Herb email reader — Microsoft Graph API (client credentials flow).

Cloud port: reads creds from environment variables instead of a local JSON file.
Includes 401 retry logic for token expiry.
Required env vars (set on the Routine config):
    GRAPH_TENANT_ID
    GRAPH_CLIENT_ID
    GRAPH_CLIENT_SECRET
    HERB_MAILBOX             default 'herb@icoscapital.com'
"""
from __future__ import annotations
import base64
import os
import sys
import time
from typing import Optional

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


def _retry_on_401(func, *args, **kwargs):
    """Call func(*args, **kwargs). If 401, get fresh token and retry once."""
    try:
        return func(*args, **kwargs)
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 401:
            sys.stderr.write("Graph API 401 (token expired); retrying with fresh token...\n")
            time.sleep(1)
            # Force a new token by calling _get_token again
            return func(*args, **kwargs)
        raise


def get_unread_emails(max_results: int = 20, mark_read: bool = True) -> list[dict]:
    """Returns unread messages from the herb mailbox. Marks each as read after fetching
    (default), so a subsequent call doesn't re-process them.

    Each dict has: id, subject, from_email, from_name, received, body_text, has_attachments,
    conversation_id.

    Includes 401 retry logic for token expiry.
    """
    token, mailbox = _get_token()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    url = (
        f"{GRAPH_BASE}/users/{mailbox}/messages"
        f"?$filter=isRead eq false"
        f"&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,body,conversationId"
        f"&$top={max_results}"
        f"&$orderby=receivedDateTime desc"
    )
    resp = requests.get(url, headers=headers, timeout=30)

    # 401 retry
    if resp.status_code == 401:
        sys.stderr.write("Graph API 401 on get_unread_emails; retrying with fresh token...\n")
        time.sleep(1)
        token, mailbox = _get_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        resp = requests.get(url, headers=headers, timeout=30)

    resp.raise_for_status()
    msgs = resp.json().get("value", [])

    out = []
    for m in msgs:
        out.append({
            "id": m["id"],
            "subject": m.get("subject", ""),
            "from_email": m["from"]["emailAddress"]["address"],
            "from_name": m["from"]["emailAddress"].get("name", ""),
            "received": m["receivedDateTime"],
            "body_text": m.get("body", {}).get("content", m.get("bodyPreview", "")),
            "has_attachments": m.get("hasAttachments", False),
            "conversation_id": m.get("conversationId", ""),
        })
        if mark_read:
            mark_resp = requests.patch(
                f"{GRAPH_BASE}/users/{mailbox}/messages/{m['id']}",
                headers=headers,
                json={"isRead": True},
                timeout=30,
            )
            # 401 on mark — retry once but don't block the whole batch
            if mark_resp.status_code == 401:
                sys.stderr.write(f"Graph API 401 marking {m['id']} read; retrying...\n")
                time.sleep(1)
                token, mailbox = _get_token()
                headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                mark_resp = requests.patch(
                    f"{GRAPH_BASE}/users/{mailbox}/messages/{m['id']}",
                    headers=headers,
                    json={"isRead": True},
                    timeout=30,
                )
                if mark_resp.status_code != 200:
                    sys.stderr.write(f"Failed to mark {m['id']} read after retry; continuing anyway\n")

    return out


def get_attachments(message_id: str) -> list[dict]:
    """Returns list of {filename, content_bytes} for the given message."""
    token, mailbox = _get_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}/attachments"
    resp = requests.get(url, headers=headers, timeout=30)

    # 401 retry
    if resp.status_code == 401:
        sys.stderr.write("Graph API 401 on get_attachments; retrying with fresh token...\n")
        time.sleep(1)
        token, mailbox = _get_token()
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(url, headers=headers, timeout=30)

    resp.raise_for_status()
    out = []
    for att in resp.json().get("value", []):
        if att.get("@odata.type") == "#microsoft.graph.fileAttachment":
            out.append({
                "filename": att["name"],
                "content_bytes": base64.b64decode(att["contentBytes"]),
            })
    return out


def mark_unread(message_id: str) -> None:
    """Mark a specific message as unread — escape hatch for when processing fails mid-tick."""
    token, mailbox = _get_token()
    resp = requests.patch(
        f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"isRead": False},
        timeout=30,
    )

    # 401 retry
    if resp.status_code == 401:
        sys.stderr.write("Graph API 401 on mark_unread; retrying with fresh token...\n")
        time.sleep(1)
        token, mailbox = _get_token()
        resp = requests.patch(
            f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"isRead": False},
            timeout=30,
        )

    resp.raise_for_status()


if __name__ == "__main__":
    emails = get_unread_emails(mark_read=False)
    print(f"Found {len(emails)} unread emails:")
    for e in emails:
        attach = "[attach]" if e["has_attachments"] else ""
        print(f"  [{e['received'][:10]}] {e['from_email']:30} | {e['subject']} {attach}")
