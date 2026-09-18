-- Ennstal Connect: expanded business profiles, photo folders and profile sharing.

alter table public.profiles add column if not exists company_category text;
alter table public.profiles add column if not exists company_address text;
alter table public.profiles add column if not exists company_phone text;
alter table public.profiles add column if not exists company_email text;

create table if not exists public.profile_photo_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique(owner_id,title)
);
alter table public.profile_photo_folders enable row level security;
grant select,insert,update,delete on public.profile_photo_folders to authenticated;

drop policy if exists profile_photo_folders_read on public.profile_photo_folders;
create policy profile_photo_folders_read on public.profile_photo_folders
for select to authenticated using (true);

drop policy if exists profile_photo_folders_insert on public.profile_photo_folders;
create policy profile_photo_folders_insert on public.profile_photo_folders
for insert to authenticated with check (owner_id=(select auth.uid()));

drop policy if exists profile_photo_folders_update on public.profile_photo_folders;
create policy profile_photo_folders_update on public.profile_photo_folders
for update to authenticated
using (owner_id=(select auth.uid()))
with check (owner_id=(select auth.uid()));

drop policy if exists profile_photo_folders_delete on public.profile_photo_folders;
create policy profile_photo_folders_delete on public.profile_photo_folders
for delete to authenticated using (owner_id=(select auth.uid()));

alter table public.member_photos
  add column if not exists folder_id uuid references public.profile_photo_folders(id) on delete set null;

drop policy if exists member_photos_write on public.member_photos;
create policy member_photos_write on public.member_photos
for insert to authenticated
with check (
  owner_id=(select auth.uid())
  and (
    folder_id is null
    or exists(
      select 1 from public.profile_photo_folders f
      where f.id=folder_id and f.owner_id=(select auth.uid())
    )
  )
);

drop policy if exists member_photos_update on public.member_photos;
create policy member_photos_update on public.member_photos
for update to authenticated
using (owner_id=(select auth.uid()))
with check (
  owner_id=(select auth.uid())
  and visibility in ('PUBLIC','FRIENDS')
  and (
    folder_id is null
    or exists(
      select 1 from public.profile_photo_folders f
      where f.id=folder_id and f.owner_id=(select auth.uid())
    )
  )
);

create table if not exists public.profile_shared_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('PHOTO','EVENT')),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique(profile_id,item_type,item_id)
);
create index if not exists profile_shared_items_profile_created_idx
  on public.profile_shared_items(profile_id,created_at desc);
alter table public.profile_shared_items enable row level security;
grant select,insert,delete on public.profile_shared_items to authenticated;

drop policy if exists profile_shared_items_read on public.profile_shared_items;
create policy profile_shared_items_read on public.profile_shared_items
for select to authenticated using (true);

drop policy if exists profile_shared_items_insert on public.profile_shared_items;
create policy profile_shared_items_insert on public.profile_shared_items
for insert to authenticated
with check (
  profile_id=(select auth.uid())
  and (
    (
      item_type='PHOTO'
      and exists(
        select 1 from public.member_photos p
        where p.id=item_id and p.owner_id=(select auth.uid())
      )
    )
    or
    (
      item_type='EVENT'
      and exists(
        select 1 from public.community_events e
        where e.id=item_id and e.status<>'CANCELLED'
      )
    )
  )
);

drop policy if exists profile_shared_items_delete on public.profile_shared_items;
create policy profile_shared_items_delete on public.profile_shared_items
for delete to authenticated using (profile_id=(select auth.uid()));

create table if not exists public.business_profile_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  document_type text not null default 'MENU' check (document_type in ('MENU','PRICE_LIST','DOCUMENT')),
  file_path text not null unique,
  mime_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists business_profile_documents_owner_idx
  on public.business_profile_documents(owner_id,created_at desc);
alter table public.business_profile_documents enable row level security;
grant select,insert,delete on public.business_profile_documents to authenticated;

drop policy if exists business_profile_documents_read on public.business_profile_documents;
create policy business_profile_documents_read on public.business_profile_documents
for select to authenticated
using (
  exists(select 1 from public.profiles p where p.id=owner_id and p.account_badge='BUSINESS')
);

drop policy if exists business_profile_documents_insert on public.business_profile_documents;
create policy business_profile_documents_insert on public.business_profile_documents
for insert to authenticated
with check (
  owner_id=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.account_badge='BUSINESS'
  )
);

drop policy if exists business_profile_documents_delete on public.business_profile_documents;
create policy business_profile_documents_delete on public.business_profile_documents
for delete to authenticated using (owner_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'business-profile-documents',
  'business-profile-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists business_profile_documents_storage_insert on storage.objects;
create policy business_profile_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='business-profile-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.account_badge='BUSINESS'
  )
);

drop policy if exists business_profile_documents_storage_read on storage.objects;
create policy business_profile_documents_storage_read
on storage.objects for select to authenticated
using (
  bucket_id='business-profile-documents'
  and exists(
    select 1 from public.business_profile_documents d
    where d.file_path=storage.objects.name
  )
);

drop policy if exists business_profile_documents_storage_delete on storage.objects;
create policy business_profile_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id='business-profile-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function public.update_my_business_profile_extended(
  p_description text,
  p_website text,
  p_opening_hours text,
  p_category text,
  p_address text,
  p_phone text,
  p_email text
)
returns void
language plpgsql
security invoker
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and account_badge='BUSINESS'
  ) then
    raise exception 'Nur Unternehmenskonten können Unternehmensdaten bearbeiten.';
  end if;

  update public.profiles set
    company_description=nullif(trim(coalesce(p_description,'')),''),
    company_website=nullif(trim(coalesce(p_website,'')),''),
    company_opening_hours=nullif(trim(coalesce(p_opening_hours,'')),''),
    company_category=nullif(trim(coalesce(p_category,'')),''),
    company_address=nullif(trim(coalesce(p_address,'')),''),
    company_phone=nullif(trim(coalesce(p_phone,'')),''),
    company_email=nullif(trim(coalesce(p_email,'')),'')
  where id=auth.uid();
end;
$$;

revoke all on function public.update_my_business_profile_extended(text,text,text,text,text,text,text) from public;
grant execute on function public.update_my_business_profile_extended(text,text,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
