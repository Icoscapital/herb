-- Add 'EMAILING' to the herb_runs status check constraint.
--
-- finish_run() uses EMAILING as a crash-safe atomic-claim intermediate
-- ("claimed the email, sending now") between DONE and EMAILED, and
-- watch_tick.py treats it as an in-flight status — but it was never added
-- to the constraint, so the claim UPDATE threw a check-constraint violation
-- on every run that reached the email step. Verified empirically 2026-07-23.
--
-- Run in the Supabase SQL editor (project lwgypkokjqerkgcpqhnt).

ALTER TABLE herb_runs DROP CONSTRAINT IF EXISTS herb_runs_status_check;
ALTER TABLE herb_runs ADD CONSTRAINT herb_runs_status_check
  CHECK (status IN ('PENDING','SEARCHING','DONE','EMAILING','EMAILED','ERROR','COMPLETED'));
