"""
Semantic layer — optional Voyage AI embeddings over herb_seen.

Everything here degrades gracefully:
  - No VOYAGE_API_KEY            -> embeddings disabled, trigram search still works
  - herb_seen.embedding missing  -> writes skipped with a log line
  - Voyage API error             -> logged, run continues

Activate by adding VOYAGE_API_KEY to the GitHub Actions secrets (voyage-3-lite,
512 dims — generous free tier at https://www.voyageai.com). Once active:
  - every stored company gets an embedding on finish_run
  - match_similar(text) finds thesis-neighbours across ALL past mandates
"""
from __future__ import annotations

import os

import requests

from .herb_web_run import _get_sb

VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
MODEL = "voyage-3-lite"          # 512-dim — matches herb_seen.embedding vector(512)
BATCH = 96


def enabled() -> bool:
    return bool(os.environ.get("VOYAGE_API_KEY"))


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    """Embed a list of strings. Returns None when disabled or on failure."""
    key = os.environ.get("VOYAGE_API_KEY")
    if not key or not texts:
        return None
    out: list[list[float]] = []
    try:
        for i in range(0, len(texts), BATCH):
            r = requests.post(
                VOYAGE_URL,
                headers={"Authorization": f"Bearer {key}"},
                json={"model": MODEL, "input": texts[i:i + BATCH],
                      "input_type": "document"},
                timeout=60,
            )
            r.raise_for_status()
            out.extend(item["embedding"] for item in r.json()["data"])
        return out
    except Exception as e:
        print(f"[embeddings] embed failed (non-fatal): {e}")
        return None


def embed_companies(companies: list[dict]) -> None:
    """Write embeddings for these companies' herb_seen rows. Never raises."""
    if not enabled():
        return
    try:
        from .herb_memory import company_key
        keyed = [(company_key(c),
                  f"{c.get('name', '')} — {c.get('description', '')[:400]}")
                 for c in companies if c.get("name")]
        keyed = [(k, t) for k, t in keyed if k]
        vecs = embed_texts([t for _, t in keyed])
        if not vecs:
            return
        sb = _get_sb()
        for (k, _), v in zip(keyed, vecs):
            sb.table("herb_seen").update({"embedding": v}).eq("company_key", k).execute()
        print(f"[embeddings] wrote {len(vecs)} embeddings")
    except Exception as e:
        print(f"[embeddings] embed_companies skipped (non-fatal): {e}")


def match_similar(text: str, count: int = 12) -> list[dict]:
    """Nearest neighbours in herb_seen for a free-text thesis description."""
    if not enabled():
        return []
    vec = embed_texts([text])
    if not vec:
        return []
    try:
        res = _get_sb().rpc("match_herb_seen",
                            {"query_embedding": vec[0], "match_count": count}).execute()
        return res.data or []
    except Exception as e:
        print(f"[embeddings] match_similar failed (non-fatal): {e}")
        return []
