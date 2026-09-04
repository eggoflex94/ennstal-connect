-- Ennstal Connect forum, profile activity and per-feature moderation.
-- Run once in the Supabase SQL Editor after final_community_fix.sql.

create extension if not exists pgcrypto;

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('COMMUNITY','ADMIN')),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  content text not null check (char_length(content) between 3 and 10000),
  font_family text not null default 'modern' check (font_family in ('modern','serif','handwritten')),
  font_size text not null default 'normal' check (font_size in ('small','normal','large')),
  emphasis text not null default 'normal' check (emphasis in ('normal','bold','italic')),
  edited_at timestamptz,
  edited_by uuid references public.profiles(id) on delete set null,
  edit_reason text,
  created_at timestamptz not null default now()
);
create index if not exists forum_posts_scope_created_idx on public.forum_posts(scope, created_at desc);

create table if not exists public.user_feature_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature_key text not null check (feature_key in ('FORUM_POSTING','MESSAGING','FRIEND_REQUESTS')),
  is_locked boolean not null default true,
  reason text not null,
  locked_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(user_id, feature_key)
);
create index if not exists user_feature_locks_user_idx on public.user_feature_locks(user_id);

create table if not exists public.profile_activity (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (char_length(activity_type) between 3 and 120),
  created_at timestamptz not null default now()
);
create index if not exists profile_activity_profile_created_idx on public.profile_activity(profile_id, created_at desc);

-- Community media bucket is optional in older deployments. The client falls back
-- to profile-avatars too, but this keeps homepage uploads in their own bucket.
insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do update set public = true;

alter table public.forum_posts enable row level security;
alter table public.user_feature_locks enable row level security;
alter table public.profile_activity enable row level security;

revoke all on public.forum_posts from anon, authenticated;
revoke all on public.user_feature_locks from anon, authenticated;
revoke all on public.profile_activity from anon, authenticated;
grant select, insert on public.forum_posts to authenticated;
grant select on public.user_feature_locks to authenticated;
grant select, insert on public.profile_activity to authenticated;

drop policy if exists forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts for select to authenticated
using (scope = 'COMMUNITY' or public.ec_is_admin());
drop policy if exists forum_posts_create on public.forum_posts;
create policy forum_posts_create on public.forum_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (
    (scope = 'ADMIN' and public.ec_is_admin())
    or (scope = 'COMMUNITY' and not exists (
      select 1 from public.user_feature_locks lock
      where lock.user_id = (select auth.uid()) and lock.feature_key = 'FORUM_POSTING' and lock.is_locked
    ))
  )
);
drop policy if exists feature_locks_read on public.user_feature_locks;
create policy feature_locks_read on public.user_feature_locks for select to authenticated
using (user_id = (select auth.uid()) or public.ec_is_head_admin());
drop policy if exists profile_activity_read on public.profile_activity;
create policy profile_activity_read on public.profile_activity for select to authenticated
using (profile_id = (select auth.uid()));
drop policy if exists profile_activity_create on public.profile_activity;
create policy profile_activity_create on public.profile_activity for insert to authenticated
with check (profile_id = (select auth.uid()) and actor_id = (select auth.uid()));

drop policy if exists community_media_read on storage.objects;
create policy community_media_read on storage.objects for select to authenticated using (bucket_id = 'community-media');
drop policy if exists community_media_upload on storage.objects;
create policy community_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'community-media' and owner_id = (select auth.uid()));

create or replace function public.admin_edit_forum_post(p_post_id uuid, p_title text, p_content text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Forumsbeiträge bearbeiten.'; end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_content)) < 3 or char_length(trim(p_reason)) < 3 then raise exception 'Titel, Beitrag und Grund müssen ausgefüllt sein.'; end if;
  update public.forum_posts set title = trim(p_title), content = trim(p_content), edited_at = now(), edited_by = auth.uid(), edit_reason = trim(p_reason) where id = p_post_id;
  if not found then raise exception 'Beitrag nicht gefunden.'; end if;
  perform public.ec_log('FORUM_POST_EDITED', null, jsonb_build_object('post_id', p_post_id, 'reason', trim(p_reason)));
end;
$$;

create or replace function public.admin_set_feature_lock(p_target_user uuid, p_feature_key text, p_is_locked boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Funktionen sperren.'; end if;
  if p_target_user = auth.uid() or exists(select 1 from public.profiles where id = p_target_user and role = 'HEAD_ADMIN') then raise exception 'Der Head Admin kann nicht eingeschränkt werden.'; end if;
  if p_feature_key not in ('FORUM_POSTING','MESSAGING','FRIEND_REQUESTS') or char_length(trim(p_reason)) < 3 then raise exception 'Ungültige Funktion oder fehlender Grund.'; end if;
  insert into public.user_feature_locks(user_id,feature_key,is_locked,reason,locked_by,updated_at)
  values(p_target_user,p_feature_key,p_is_locked,trim(p_reason),auth.uid(),now())
  on conflict(user_id,feature_key) do update set is_locked=excluded.is_locked, reason=excluded.reason, locked_by=excluded.locked_by, updated_at=now();
  insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
  values(auth.uid(),p_target_user,case when p_is_locked then '⚠️ Eine Community-Funktion wurde vorübergehend gesperrt: ' else '✅ Eine Community-Funktion wurde wieder freigegeben: ' end || p_feature_key || E'\n\nGrund: ' || trim(p_reason),false,now());
  perform public.ec_log('FEATURE_LOCK_CHANGED', p_target_user, jsonb_build_object('feature',p_feature_key,'locked',p_is_locked,'reason',trim(p_reason)));
end;
$$;

revoke all on function public.admin_edit_forum_post(uuid,text,text,text) from public;
revoke all on function public.admin_set_feature_lock(uuid,text,boolean,text) from public;
grant execute on function public.admin_edit_forum_post(uuid,text,text,text) to authenticated;
grant execute on function public.admin_set_feature_lock(uuid,text,boolean,text) to authenticated;
notify pgrst, 'reload schema';
