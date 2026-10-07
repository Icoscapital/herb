-- Herb: herb_seen.compass_company_id for sightings that are now holdings.
-- Generated 2026-10-07 by @icos/company seed-registry.mjs from the live databases. REVIEW, then apply.
-- Idempotent: only fills nulls, inserts with on conflict do nothing.

alter table herb_seen add column if not exists compass_company_id int;
comment on column herb_seen.compass_company_id is 'Compass company.id when this sighting became an Icos holding. Null for the pipeline at large.';

update herb_seen set compass_company_id = v.cid
from (values
  ('bio-prodict.com', 25),  -- Bio-Prodict → Bio-Prodict (domain)
  ('napiferyn biotech', 8),  -- Napiferyn Biotech → Napiferyn BioTech (exact)
  ('fulfoods.com', 17),  -- FUL Foods → Ful Foods (exact)
  ('mevaldi.com', 16),  -- Mevaldi → Mevaldi (domain)
  ('holiferm.com', 1),  -- Holiferm → Holiferm (domain)
  ('foamlab.co', 15),  -- Foamlab → FoamLab (domain)
  ('pef-technologies.nl', 23),  -- PEF Technologies B.V. → PEF (domain)
  ('moa foodtech', 11),  -- MOA Foodtech → MOA (exact)
  ('nopalm ingredients', 22),  -- NoPalm Ingredients → NoPalm Ingredients (exact)
  ('wholefiber', 20),  -- WholeFiber → Wholefiber (exact)
  ('hello-tomorrow.org', 22),  -- NoPalm Ingredients → NoPalm Ingredients (exact)
  ('nopalm-ingredients.com', 22),  -- NoPalm Ingredients → NoPalm Ingredients (exact)
  ('moafoodtech.com', 11),  -- MOA Foodtech → MOA (domain)
  ('abolis.fr', 12),  -- Abolis Biotechnologies → Abolis Biotechnologies SAS (domain)
  ('carbonclean.com', 2),  -- Carbon Clean Solutions (CCSL) → Carbon Clean (exact)
  ('carbonoro.com', 18)  -- Carbonoro → CarbonOro (domain)
) as v(k, cid)
where herb_seen.company_key = v.k and herb_seen.compass_company_id is null;
