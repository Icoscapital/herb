-- herb-uploads: make the storage bucket private and scope object access to the owner.
--
-- Background: the @icos/auth-sql sweep of 2026-10-07 flagged this bucket as
-- public (rule R11_public_bucket) — every object URL was readable without a
-- token. The upload route now returns a short-lived signed URL and the worker
-- downloads by object path with the service key, so nothing needs public reads.
--
-- Object layout: mandates/<auth.uid()>/<timestamp>-<index>-<slot>-<filename>
-- The API route and the worker use the service role (bypasses RLS); the policies
-- below only govern direct client access, which no code path uses today.
--
-- Run in the Supabase SQL editor: https://supabase.com/dashboard/project/lwgypkokjqerkgcpqhnt/sql/new
-- Idempotent: safe to re-run.

-- 1. Flip the bucket to private. getPublicUrl links stop resolving immediately.
update storage.buckets
   set public = false
 where id = 'herb-uploads';

-- 2. Owner-scoped storage.objects policies — only if none exist for this bucket.
--    (storage.objects already has RLS enabled on every Supabase project.)
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and (coalesce(qual, '') like '%herb-uploads%'
            or coalesce(with_check, '') like '%herb-uploads%')
  ) then
    raise notice 'herb-uploads: storage.objects policies already exist, leaving them untouched';
    return;
  end if;

  create policy "herb_uploads_owner_select" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'herb-uploads'
      and (storage.foldername(name))[1] = 'mandates'
      and (storage.foldername(name))[2] = auth.uid()::text
    );

  create policy "herb_uploads_owner_insert" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'herb-uploads'
      and (storage.foldername(name))[1] = 'mandates'
      and (storage.foldername(name))[2] = auth.uid()::text
    );

  create policy "herb_uploads_owner_update" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'herb-uploads'
      and (storage.foldername(name))[1] = 'mandates'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    with check (
      bucket_id = 'herb-uploads'
      and (storage.foldername(name))[1] = 'mandates'
      and (storage.foldername(name))[2] = auth.uid()::text
    );

  create policy "herb_uploads_owner_delete" on storage.objects
    for delete to authenticated
    using (
      bucket_id = 'herb-uploads'
      and (storage.foldername(name))[1] = 'mandates'
      and (storage.foldername(name))[2] = auth.uid()::text
    );

  raise notice 'herb-uploads: created four owner-scoped storage.objects policies';
end
$$;

-- Verify afterwards:
--   select id, public from storage.buckets where id = 'herb-uploads';
--   select policyname, cmd from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and policyname like 'herb_uploads_%';
