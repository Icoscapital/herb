"""Herb email reader with comprehensive error handling.

Includes 401 retry logic, safe attachment reading, and proper exception handling.
"""
from __future__ import annotations
import base64
import os
import sys
import time
from typing import Optional

import requests
from scripts.error_handler import safe_api_call, validate_file_size, APIError

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


def get_unread_emails(max_results: int = 20, mark_read: bool = True) -> list[dict]:
    """Returns unread messages from herb mailbox with comprehensive error handling."""
    
    def _do_fetch():
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
        
        if resp.status_code == 401:
            sys.stderr.write("Graph API 401 on fetch; retrying with fresh token\n")
            time.sleep(1)
            token, mailbox = _get_token()
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(url, headers=headers, timeout=30)
        
        resp.raise_for_status()
        return resp.json().get("value", []), mailbox, headers, token
    
    try:
        msgs, mailbox, headers, token = safe_api_call(_do_fetch, max_retries=1, log_prefix="get_unread_emails")
    except APIError as e:
        sys.stderr.write(f"ERROR: Failed to fetch emails: {e}\n")
        raise

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
            try:
                def _do_mark():
                    resp = requests.patch(
                        f"{GRAPH_BASE}/users/{mailbox}/messages/{m['id']}",
                        headers=headers,
                        json={"isRead": True},
                        timeout=30,
                    )
                    if resp.status_code == 401:
                        sys.stderr.write(f"Graph API 401 marking {m['id']} read; retrying\n")
                        time.sleep(1)
                        new_token, _ = _get_token()
                        headers["Authorization"] = f"Bearer {new_token}"
                        resp = requests.patch(
                            f"{GRAPH_BASE}/users/{mailbox}/messages/{m['id']}",
                            headers=headers,
                            json={"isRead": True},
                            timeout=30,
                        )
                    resp.raise_for_status()
                
                safe_api_call(_do_mark, max_retries=0, log_prefix=f"mark_read({m['id'][:8]})")
            except APIError:
                sys.stderr.write(f"WARN: Could not mark {m['id']} read; will retry next tick\n")
                # Don't block the batch

    return out


def get_attachments(message_id: str) -> list[dict]:
    """Returns attachments with error handling and size validation."""
    
    def _do_fetch_att():
        token, mailbox = _get_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}/attachments"
        resp = requests.get(url, headers=headers, timeout=30)

        if resp.status_code == 401:
            sys.stderr.write(f"Graph API 401 fetching attachments; retrying\n")
            time.sleep(1)
            token, mailbox = _get_token()
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(url, headers=headers, timeout=30)

        resp.raise_for_status()
        return resp.json().get("value", [])
    
    try:
        attachments = safe_api_call(_do_fetch_att, max_retries=1, log_prefix=f"get_attachments({message_id[:8]})")
    except APIError as e:
        sys.stderr.write(f"ERROR: Failed to fetch attachments: {e}\n")
        raise

    out = []
    for att in attachments:
        if att.get("@odata.type") == "#microsoft.graph.fileAttachment":
            content = base64.b64decode(att["contentBytes"])
            # Warn if large
            size_mb = len(content) / (1024 * 1024)
            if size_mb > 4:
                sys.stderr.write(f"WARN: Attachment {att['name']} is {size_mb:.1f}MB\n")
            out.append({
                "filename": att["name"],
                "content_bytes": content,
            })

    return out


def mark_unread(message_id: str) -> None:
    """Mark message unread (error recovery)."""
    
    def _do_mark():
        token, mailbox = _get_token()
        resp = requests.patch(
            f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"isRead": False},
            timeout=30,
        )
        if resp.status_code == 401:
            sys.stderr.write(f"Graph API 401 on mark_unread; retrying\n")
            time.sleep(1)
            token, mailbox = _get_token()
            resp = requests.patch(
                f"{GRAPH_BASE}/users/{mailbox}/messages/{message_id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"isRead": False},
                timeout=30,
            )
        resp.raise_for_status()
    
    try:
        safe_api_call(_do_mark, max_retries=1, log_prefix=f"mark_unread({message_id[:8]})")
    except APIError as e:
        sys.stderr.write(f"ERROR: Could not mark {message_id} unread: {e}\n")
        # Don't raise - this is recovery; continue processing


if __name__ == "__main__":
    try:
        emails = get_unread_emails(mark_read=False)
        print(f"Found {len(emails)} unread emails:")
        for e in emails:
            attach = "[attach]" if e["has_attachments"] else ""
            print(f"  [{e['received'][:10]}] {e['from_email']:30} | {e['subject']} {attach}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
