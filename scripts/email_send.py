"""Herb email sender — Microsoft Graph API with robust error handling.

Cloud port: reads creds from environment variables.
Includes 401 retry logic, file size validation, and comprehensive error handling.
"""
from __future__ import annotations
import base64
import os
import sys
import time

import requests
from scripts.error_handler import safe_api_call, validate_file_size, APIError

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
DEFAULT_MAILBOX = "herb@icoscapital.com"
# Graph API caps the *base64-encoded* attachment at 4MB. Base64 inflates raw
# bytes by ~33%, so the raw-byte threshold has to be ~3MB to stay under it.
MAX_ATTACHMENT_SIZE_MB = 3.0


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

    Robust error handling:
    - Validates attachment sizes before sending
    - Retries on 401 (token expiry)
    - Raises APIError on fatal failures
    """
    # Validate attachments — each one against the raw-byte threshold
    if attachments:
        for att in attachments:
            validate_file_size(
                att["content_bytes"],
                MAX_ATTACHMENT_SIZE_MB,
                att["filename"]
            )

    def _do_send():
        """Send the message with retry on 401 (token expiry) and 429/503/504
        (transient backend issues). Honors Retry-After header for 429."""
        # Up to 4 attempts: initial + 3 retries on transient failures
        last_resp = None
        for attempt in range(4):
            try:
                token, mailbox = _get_token()
            except requests.RequestException as e:
                # Couldn't fetch token — backoff and retry
                if attempt == 3:
                    raise APIError(f"Token fetch failed after 4 attempts: {e}")
                time.sleep(2 ** attempt)
                continue

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

            try:
                resp = requests.post(
                    f"{GRAPH_BASE}/users/{mailbox}/sendMail",
                    headers=headers,
                    json={"message": message, "saveToSentItems": True},
                    timeout=60,
                )
            except requests.RequestException as e:
                # Network error — retry with backoff
                if attempt == 3:
                    raise APIError(f"Graph sendMail network error after 4 attempts: {e}")
                sleep_for = 2 ** attempt
                sys.stderr.write(f"Graph sendMail network error (attempt {attempt + 1}/4): {e}; retry in {sleep_for}s\n")
                time.sleep(sleep_for)
                continue

            last_resp = resp

            # 2xx = success (sendMail returns 202 with empty body)
            if 200 <= resp.status_code < 300:
                return resp.json() if resp.content else None

            # 401 = token expired; fetch a fresh token and retry
            if resp.status_code == 401:
                if attempt < 3:
                    sys.stderr.write(f"Graph API 401 (token expired, attempt {attempt + 1}/4); retrying with fresh token\n")
                    time.sleep(1)
                    continue

            # 429 = rate limited; honor Retry-After then retry
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", "5"))
                # Cap at 60s — anything longer means we should fail the run
                retry_after = min(retry_after, 60)
                if attempt < 3:
                    sys.stderr.write(f"Graph API 429 (rate limited, attempt {attempt + 1}/4); sleeping {retry_after}s\n")
                    time.sleep(retry_after)
                    continue

            # 503 / 504 = transient backend issue; exponential backoff
            if resp.status_code in (502, 503, 504):
                if attempt < 3:
                    sleep_for = 2 ** attempt
                    sys.stderr.write(f"Graph API {resp.status_code} (transient, attempt {attempt + 1}/4); retry in {sleep_for}s\n")
                    time.sleep(sleep_for)
                    continue

            # All other 4xx/5xx codes — don't retry
            resp.raise_for_status()

        # Out of retries
        if last_resp is not None:
            last_resp.raise_for_status()
        raise APIError(f"Graph sendMail exhausted retries to {to_address}")

    try:
        return _do_send()
    except (APIError, requests.HTTPError, requests.RequestException) as e:
        sys.stderr.write(f"ERROR: Failed to send email to {to_address}: {e}\n")
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.email_send <recipient>")
        sys.exit(2)
    try:
        send_email(sys.argv[1], "Herb cloud — test email", "Cloud-hosted Graph send is working.")
        print(f"Sent test email to {sys.argv[1]}")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
