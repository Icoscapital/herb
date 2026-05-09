"""
Thin Pipedrive REST API wrapper for the dropin-pipedrive plugin.

Only the endpoints we actually need: search organizations, search persons by email,
create org / person / deal, attach a file, fetch a deal (for cc_email).

Auth: a single shared service-account API token, passed as the api_token query param.
"""
from __future__ import annotations

import os
from typing import Any, Optional
from urllib.parse import urlencode

import requests


class PipedriveClient:
    def __init__(self, domain: str, api_token: str):
        if not domain or not api_token:
            raise ValueError("Pipedrive domain and api_token are required")
        # domain like "icoscapital" — we add the suffix ourselves
        self.base = f"https://{domain}.pipedrive.com/api/v1"
        self.token = api_token
        self.session = requests.Session()

    # ---------- internals ----------

    def _url(self, path: str, **params: Any) -> str:
        params["api_token"] = self.token
        return f"{self.base}{path}?{urlencode(params)}"

    def _get(self, path: str, **params: Any) -> dict:
        r = self.session.get(self._url(path, **params), timeout=30)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: dict) -> dict:
        r = self.session.post(self._url(path), json=payload, timeout=30)
        if not r.ok:
            raise RuntimeError(f"POST {path} failed [{r.status_code}]: {r.text}")
        return r.json()

    # ---------- search ----------

    def search_organizations(self, term: str, exact: bool = False) -> list[dict]:
        """Returns matching org items: [{id, name, ...}]."""
        out = self._get("/organizations/search", term=term, exact_match=str(exact).lower(), limit=20)
        items = (out.get("data") or {}).get("items") or []
        return [it.get("item", {}) for it in items]

    def search_persons_by_email(self, email: str) -> list[dict]:
        out = self._get("/persons/search", term=email, fields="email", exact_match="true", limit=10)
        items = (out.get("data") or {}).get("items") or []
        return [it.get("item", {}) for it in items]

    def list_open_deals_for_org(self, org_id: int, pipeline_id: Optional[int] = None) -> list[dict]:
        """Returns all open deals on an org. Optionally filtered to a pipeline."""
        out = self._get(f"/organizations/{org_id}/deals", status="open", limit=50)
        deals = out.get("data") or []
        if pipeline_id is not None:
            deals = [d for d in deals if d.get("pipeline_id") == pipeline_id]
        return deals

    def list_all_deals_for_org(self, org_id: int, pipeline_id: Optional[int] = None) -> list[dict]:
        """Returns all deals on an org regardless of status (open, won, lost),
        excluding deleted. Used so the dropin skill can detect prior Lost/Won
        deals and attach the new doc instead of creating a duplicate."""
        out = self._get(f"/organizations/{org_id}/deals", status="all_not_deleted", limit=50)
        deals = out.get("data") or []
        if pipeline_id is not None:
            deals = [d for d in deals if d.get("pipeline_id") == pipeline_id]
        return deals

    def get_deal(self, deal_id: int) -> dict:
        out = self._get(f"/deals/{deal_id}")
        return out.get("data") or {}

    # ---------- create ----------

    def create_organization(self, name: str, custom_fields: Optional[dict] = None) -> dict:
        payload: dict = {"name": name}
        if custom_fields:
            payload.update(custom_fields)
        out = self._post("/organizations", payload)
        return out.get("data") or {}

    def create_person(self, name: str, email: Optional[str] = None,
                      org_id: Optional[int] = None, phone: Optional[str] = None) -> dict:
        payload: dict = {"name": name}
        if email:
            payload["email"] = [{"value": email, "primary": True}]
        if phone:
            payload["phone"] = [{"value": phone, "primary": True}]
        if org_id:
            payload["org_id"] = org_id
        out = self._post("/persons", payload)
        return out.get("data") or {}

    def create_deal(self, payload: dict) -> dict:
        """Pass the full deal payload. Custom fields use their hash keys."""
        out = self._post("/deals", payload)
        return out.get("data") or {}

    # ---------- file upload ----------

    def attach_file_to_deal(self, deal_id: int, file_path: str) -> dict:
        if not os.path.isfile(file_path):
            raise FileNotFoundError(file_path)
        # Read full content to bytes (some Pipedrive endpoints reject streaming
        # multipart) and pass an explicit content-type. Without these two
        # fixes the API returns "No files provided" with a 400 even though
        # the multipart body is well-formed by requests' standards.
        with open(file_path, "rb") as fh:
            content = fh.read()
        if not content:
            raise RuntimeError(f"File at {file_path} is empty (0 bytes); Pipedrive will reject.")
        # Use a fresh requests call (NOT the session) to avoid any sticky
        # headers from prior JSON requests that might confuse the multipart upload.
        url = self._url("/files")
        files = {"file": (os.path.basename(file_path), content, "application/octet-stream")}
        data = {"deal_id": str(deal_id)}
        r = requests.post(url, files=files, data=data, timeout=120)
        if not r.ok:
            raise RuntimeError(f"Attach failed [{r.status_code}]: {r.text}")
        return (r.json() or {}).get("data") or {}
