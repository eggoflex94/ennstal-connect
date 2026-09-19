-- Ennstal Connect: per-document visibility for business profile files.

alter table public.business_profile_documents
  add column if not exists visibility text not null default 'MEMBERS';

alter table public.business_profile_documents
  drop constraint if exists business_profile_documents_visibility_check;

alter table public.business_profile_documents
  add constraint business_profile_documents_visibility_check
  check (visibility in ('PUBLIC','MEMBERS','HIDDEN'));

grant select on public.business_profile_documents to anon;
grant select,insert,update,delete on public.business_profile_documents to authenticated;

drop policy if exists business_profile_documents_read on public.business_profile_documents;
drop policy if exists business_profile_documents_read_public on public.business_profile_documents;
drop policy if exists business_profile_documents_read_anon on public.business_profile_documents;
drop policy if exists business_profile_documents_read_authenticated on public.business_profile_documents;
drop policy if exists business_profile_documents_update on public.business_profile_documents;

create policy business_profile_documents_read_anon
on public.business_profile_documents
for select
to anon
using (
  visibility='PUBLIC'
  and exists(
    select 1 from public.profiles p
    where p.id=owner_id and p.account_badge='BUSINESS'
  )
);

create policy business_profile_documents_read_authenticated
on public.business_profile_documents
for select
to authenticated
using (
  owner_id=(select auth.uid())
  or (
    visibility in ('PUBLIC','MEMBERS')
    and exists(
      select 1 from public.profiles p
      where p.id=owner_id and p.account_badge='BUSINESS'
    )
  )
);

create policy business_profile_documents_update
on public.business_profile_documents
for update
to authenticated
using (
  owner_id=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.account_badge='BUSINESS'
  )
)
with check (
  owner_id=(select auth.uid())
  and visibility in ('PUBLIC','MEMBERS','HIDDEN')
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.account_badge='BUSINESS'
  )
);

drop policy if exists business_profile_documents_storage_read on storage.objects;
drop policy if exists business_profile_documents_storage_read_public on storage.objects;
drop policy if exists business_profile_documents_storage_read_anon on storage.objects;
drop policy if exists business_profile_documents_storage_read_authenticated on storage.objects;

create policy business_profile_documents_storage_read_anon
on storage.objects
for select
to anon
using (
  bucket_id='business-profile-documents'
  and exists(
    select 1
    from public.business_profile_documents d
    where d.file_path=storage.objects.name
      and d.visibility='PUBLIC'
  )
);

create policy business_profile_documents_storage_read_authenticated
on storage.objects
for select
to authenticated
using (
  bucket_id='business-profile-documents'
  and exists(
    select 1
    from public.business_profile_documents d
    where d.file_path=storage.objects.name
      and (
        d.owner_id=(select auth.uid())
        or d.visibility in ('PUBLIC','MEMBERS')
      )
  )
);

notify pgrst,'reload schema';
