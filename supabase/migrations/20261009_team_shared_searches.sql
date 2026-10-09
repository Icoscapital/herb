-- Team-shared searches: any signed-in user can edit, re-run and mark complete any
-- search, not just the one who created it. herb_runs.user_id stays as "creator".
--
-- Live state before this migration (audited 2026-10-09): herb_runs had SELECT and
-- INSERT policies for authenticated but NO UPDATE policy, so every client-side
-- update (edit search, watch toggle, mark complete) matched zero rows silently.
-- herb_files was owner-only, so a teammate could not see a search's attachments.

-- 1. herb_runs: team UPDATE, limited by column grants to the fields the dashboard edits.
revoke update on public.herb_runs from authenticated;
grant update (theme, special_instructions, watch, status) on public.herb_runs to authenticated;

drop policy if exists "Team updates runs" on public.herb_runs;
create policy "Team updates runs" on public.herb_runs
  for update to authenticated
  using (true) with check (true);

-- 2. herb_files: per-search files are team-visible; global check-sites lists stay personal.
drop policy if exists "users_own_files" on public.herb_files;
drop policy if exists "team_run_files" on public.herb_files;
create policy "team_run_files" on public.herb_files
  for all to authenticated
  using (is_global = false or user_id = auth.uid())
  with check (is_global = false or user_id = auth.uid());

-- Check:
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename in ('herb_runs', 'herb_files') order by 1, 2;
