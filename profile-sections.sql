-- New isolated profile data only; existing data and policies are unchanged.
create table public.profile_sections (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('FIELD','TEXT','IMAGE','PHOTO')),
 title text not null default '' check(length(title)<=100),
 body text not null default '' check(length(body)<=10000),
 visibility text not null default 'PRIVATE' check(visibility in ('PUBLIC','FRIENDS','PRIVATE')),
 media_path text check(media_path is null or media_path like owner_id::text || '/%'),
 appearance jsonb not null default '{}'::jsonb check(jsonb_typeof(appearance)='object' and octet_length(appearance::text)<=2000),
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create index profile_sections_owner_order on public.profile_sections(owner_id,sort_order,created_at);
alter table public.profile_sections enable row level security;
revoke all on public.profile_sections from anon,authenticated;
grant select,insert,update,delete on public.profile_sections to authenticated;
create policy profile_sections_read on public.profile_sections for select to authenticated using (
 owner_id=(select auth.uid()) or (
 visibility='PUBLIC' or (visibility='FRIENDS' and exists (
 select 1 from public.friendships f where f.status='ACCEPTED' and
 ((f.requester_id=owner_id and f.receiver_id=(select auth.uid())) or
 (f.receiver_id=owner_id and f.requester_id=(select auth.uid())))))
 )
);
create policy profile_sections_insert on public.profile_sections for insert to authenticated with check(owner_id=(select auth.uid()));
create policy profile_sections_update on public.profile_sections for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy profile_sections_delete on public.profile_sections for delete to authenticated using(owner_id=(select auth.uid()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('profile-layout-media','profile-layout-media',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
create policy profile_layout_media_insert on storage.objects for insert to authenticated with check(bucket_id='profile-layout-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Explicit privacy checks: knowing an object path NEVER grants private access.
create policy profile_layout_media_read on storage.objects for select to authenticated using (
 bucket_id='profile-layout-media' and (
 (storage.foldername(name))[1]=(select auth.uid())::text or
 exists(select 1 from public.profile_sections s where s.media_path=name and (
 s.visibility='PUBLIC' or (s.visibility='FRIENDS' and exists(
 select 1 from public.friendships f where f.status='ACCEPTED' and
 ((f.requester_id=s.owner_id and f.receiver_id=(select auth.uid())) or
 (f.receiver_id=s.owner_id and f.requester_id=(select auth.uid())))))
 ))
 )
);
create policy profile_layout_media_delete on storage.objects for delete to authenticated using(bucket_id='profile-layout-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
