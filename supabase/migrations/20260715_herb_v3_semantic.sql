-- Herb v3: semantic memory + market-map segments.
-- Run in the Supabase SQL editor (project lwgypkokjqerkgcpqhnt),
-- AFTER 20260713_herb_v2_features.sql.

-- 1. Fuzzy-matching + vector extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Market-map segment per longlist row
ALTER TABLE herb_longlist ADD COLUMN IF NOT EXISTS segment TEXT;

-- 3. Company embedding (voyage-3-lite, 512 dims) — nullable; only filled
--    when VOYAGE_API_KEY is configured in GitHub Actions.
ALTER TABLE herb_seen ADD COLUMN IF NOT EXISTS embedding vector(512);

-- 4. Trigram indexes: fast fuzzy dedup ("Vernaio" vs "Vernaio GmbH")
CREATE INDEX IF NOT EXISTS herb_seen_name_trgm
  ON herb_seen USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS herb_longlist_name_trgm
  ON herb_longlist USING gin (name gin_trgm_ops);

-- 5. Vector index + similarity RPC (used once embeddings exist)
CREATE INDEX IF NOT EXISTS herb_seen_embedding_idx
  ON herb_seen USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION match_herb_seen(
  query_embedding vector(512),
  match_count int DEFAULT 12
)
RETURNS TABLE(company_key text, name text, domain text, last_status text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT company_key, name, domain, last_status,
         1 - (embedding <=> query_embedding) AS similarity
  FROM herb_seen
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 6. Trigram similarity RPC — works TODAY without any embedding key.
--    Finds companies in Herb's accumulated universe whose name or stored
--    description resembles the query terms.
CREATE OR REPLACE FUNCTION search_herb_universe(
  q text,
  match_count int DEFAULT 15
)
RETURNS TABLE(name text, website text, description text, source text, run_id uuid, sim float)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (lower(l.name))
         l.name, l.website, l.description, l.source, l.run_id,
         GREATEST(similarity(l.name, q),
                  similarity(coalesce(l.description, ''), q)) AS sim
  FROM herb_longlist l
  WHERE similarity(l.name, q) > 0.15
     OR coalesce(l.description, '') % q
  ORDER BY lower(l.name), sim DESC
  LIMIT match_count;
$$;
