-- Updates On Watch & Follow: record the key terms a run was narrowed by. 2026-08-28.
--
-- Nityen: "herb watch & follow should also have keyword option and show last run date."
--
-- Ported from Vantage, which added the same option first (migration 046 there). The reason is cost:
-- an unnarrowed run researches every qualifying deal, each with several web searches, and there is
-- no schedule to spread that out — every run is someone clicking the button. Terms let a run cover
-- what someone actually cares about this month rather than the whole set.
--
-- Terms are ADDITIVE to the standing criteria, never a replacement: stage order_nr >= 4, CEP Interest
-- flagged and Framework Verdict not "No Go" still gate everything. Terms only narrow within that, so
-- no keyword can pull in a deal the criteria would have excluded.
--
-- Stored on the run rather than only passed through, so a feed showing 12 companies instead of 45 can
-- say why — the same reason Vantage keeps report.selection on a prospect report.
--
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new

ALTER TABLE herb_watch_follow_runs ADD COLUMN IF NOT EXISTS terms TEXT;
