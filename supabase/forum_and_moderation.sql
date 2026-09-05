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

alter table public.profiles add column if not exists forum_moderator boolean not null default false;
create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.forum_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 2 and 3000),
  edited_at timestamptz, edited_by uuid references public.profiles(id) on delete set null,
  edit_reason text, created_at timestamptz not null default now()
);
create index if not exists forum_replies_post_created_idx on public.forum_replies(post_id, created_at);

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
-- All profile IDs are UUIDs. Matching that type prevents text/UUID errors.
alter table public.profile_activity add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_activity add column if not exists actor_id uuid references public.profiles(id) on delete cascade;
alter table public.profile_activity add column if not exists activity_type text;
alter table public.profile_activity add column if not exists created_at timestamptz not null default now();
-- A previous preview stored these two columns as text. Convert UUID strings
-- before creating policies that compare them with auth.uid() (a UUID).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_activity'
      and column_name = 'profile_id' and data_type = 'text'
  ) then
    alter table public.profile_activity
      alter column profile_id type uuid using nullif(btrim(profile_id), '')::uuid;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_activity'
      and column_name = 'actor_id' and data_type = 'text'
  ) then
    alter table public.profile_activity
      alter column actor_id type uuid using nullif(btrim(actor_id), '')::uuid;
  end if;
end;
$$;
create index if not exists profile_activity_profile_created_idx on public.profile_activity(profile_id, created_at desc);

-- Community media bucket is optional in older deployments. The client falls back
-- to profile-avatars too, but this keeps homepage uploads in their own bucket.
insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do update set public = true;

alter table public.forum_posts enable row level security;
alter table public.forum_replies enable row level security;
alter table public.user_feature_locks enable row level security;
alter table public.profile_activity enable row level security;

-- Make this migration work even when the earlier community repair was not run.
create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create or replace function public.ec_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id::text = auth.uid()::text and role in ('ADMIN','HEAD_ADMIN') and account_status = 'ACTIVE');
$$;
create or replace function public.ec_is_head_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id::text = auth.uid()::text and role = 'HEAD_ADMIN' and account_status = 'ACTIVE');
$$;
create or replace function public.ec_log(p_action text, p_target uuid default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_log(actor_id, action, target_id, details)
  values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on public.forum_posts from anon, authenticated;
revoke all on public.forum_replies from anon, authenticated;
revoke all on public.user_feature_locks from anon, authenticated;
revoke all on public.profile_activity from anon, authenticated;
grant select, insert on public.forum_posts to authenticated;
grant select on public.forum_replies to authenticated;
grant select on public.user_feature_locks to authenticated;
grant select, insert on public.profile_activity to authenticated;

drop policy if exists forum_posts_read on public.forum_posts;
create policy forum_posts_read on public.forum_posts for select to authenticated
using (scope = 'COMMUNITY' or public.ec_is_admin());
drop policy if exists forum_replies_read on public.forum_replies;
create policy forum_replies_read on public.forum_replies for select to authenticated
using (exists(select 1 from public.forum_posts post where post.id=post_id and (post.scope='COMMUNITY' or public.ec_is_admin())));
drop policy if exists forum_posts_create on public.forum_posts;
create policy forum_posts_create on public.forum_posts for insert to authenticated
with check (
  author_id::text = (select auth.uid()::text)
  and (
    (scope = 'ADMIN' and public.ec_is_admin())
    or (scope = 'COMMUNITY' and not exists (
      select 1 from public.user_feature_locks lock
      where lock.user_id::text = (select auth.uid()::text) and lock.feature_key = 'FORUM_POSTING' and lock.is_locked
    ))
  )
);
drop policy if exists forum_posts_head_admin_update on public.forum_posts;
create policy forum_posts_head_admin_update on public.forum_posts for update to authenticated
using (public.ec_is_head_admin()) with check (public.ec_is_head_admin());
drop policy if exists forum_posts_head_admin_delete on public.forum_posts;
create policy forum_posts_head_admin_delete on public.forum_posts for delete to authenticated
using (public.ec_is_head_admin() or author_id::text = auth.uid()::text);
drop policy if exists feature_locks_read on public.user_feature_locks;
create policy feature_locks_read on public.user_feature_locks for select to authenticated
using (user_id::text = (select auth.uid()::text) or public.ec_is_head_admin());
drop policy if exists profile_activity_read on public.profile_activity;
create policy profile_activity_read on public.profile_activity for select to authenticated
using (profile_id::text = (select auth.uid()::text));
drop policy if exists profile_activity_create on public.profile_activity;
create policy profile_activity_create on public.profile_activity for insert to authenticated
with check (profile_id::text = (select auth.uid()::text) and actor_id::text = (select auth.uid()::text));

drop policy if exists community_media_read on storage.objects;
create policy community_media_read on storage.objects for select to authenticated using (bucket_id = 'community-media');
drop policy if exists community_media_upload on storage.objects;
create policy community_media_upload on storage.objects for insert to authenticated
with check (bucket_id = 'community-media' and owner_id::text = (select auth.uid()::text));

create or replace function public.admin_edit_forum_post(p_post_id uuid, p_title text, p_content text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Forumsbeiträge bearbeiten.'; end if;
  if char_length(trim(p_title)) < 3 or char_length(trim(p_content)) < 3 or char_length(trim(p_reason)) < 3 then raise exception 'Titel, Beitrag und Grund müssen ausgefüllt sein.'; end if;
  update public.forum_posts set title = trim(p_title), content = trim(p_content), edited_at = now(), edited_by = auth.uid(), edit_reason = trim(p_reason) where id = p_post_id;
  if not found then raise exception 'Beitrag nicht gefunden.'; end if;
end;
$$;

create or replace function public.forum_create_post(p_scope text, p_title text, p_content text, p_font_family text default 'modern', p_font_size text default 'normal', p_emphasis text default 'normal')
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_scope not in ('COMMUNITY','ADMIN') or char_length(trim(p_title)) < 3 or char_length(trim(p_content)) < 3 then raise exception 'Ungültiger Forumsbeitrag.'; end if;
 if p_scope='ADMIN' and not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
 if p_scope='COMMUNITY' and exists(select 1 from public.user_feature_locks where user_id=auth.uid() and feature_key='FORUM_POSTING' and is_locked) then raise exception 'Deine Forumsfunktion ist gesperrt.'; end if;
 insert into public.forum_posts(scope,author_id,title,content,font_family,font_size,emphasis) values(p_scope,auth.uid(),trim(p_title),trim(p_content),p_font_family,p_font_size,p_emphasis);
end; $$;
create or replace function public.forum_update_own_post(p_post_id uuid, p_title text, p_content text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if char_length(trim(p_title))<3 or char_length(trim(p_content))<3 then raise exception 'Titel und Beitrag sind zu kurz.'; end if;
 update public.forum_posts set title=trim(p_title),content=trim(p_content),edited_at=now(),edited_by=auth.uid(),edit_reason='Vom Autor bearbeitet' where id=p_post_id and (author_id=auth.uid() or public.ec_is_head_admin());
 if not found then raise exception 'Du darfst diesen Beitrag nicht bearbeiten.'; end if;
end; $$;
create or replace function public.forum_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 delete from public.forum_posts where id=p_post_id and (author_id=auth.uid() or public.ec_is_head_admin());
 if not found then raise exception 'Du darfst diesen Beitrag nicht löschen.'; end if;
end; $$;

create or replace function public.ec_is_forum_moderator()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and account_status='ACTIVE' and (role in ('HEAD_ADMIN','ADMIN') or (role='SUPPORTER' and forum_moderator)));
$$;
create or replace function public.forum_create_reply(p_post_id uuid, p_content text)
returns void language plpgsql security definer set search_path=public as $$
declare post_scope text;
begin
  select scope into post_scope from public.forum_posts where id=p_post_id;
  if post_scope is null or char_length(trim(p_content)) < 2 then raise exception 'Ungültige Antwort.'; end if;
  if post_scope='ADMIN' and not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  if post_scope='COMMUNITY' and exists(select 1 from public.user_feature_locks where user_id=auth.uid() and feature_key='FORUM_POSTING' and is_locked) then raise exception 'Deine Forumsfunktion ist gesperrt.'; end if;
  insert into public.forum_replies(post_id,author_id,content) values(p_post_id,auth.uid(),trim(p_content));
end; $$;
create or replace function public.forum_update_reply(p_reply_id uuid, p_content text, p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare reply_author uuid; post_scope text;
begin
  select reply.author_id, post.scope into reply_author, post_scope from public.forum_replies reply join public.forum_posts post on post.id=reply.post_id where reply.id=p_reply_id;
  if reply_author is null or char_length(trim(p_content)) < 2 or char_length(trim(p_reason)) < 3 then raise exception 'Ungültige Antwort oder Bearbeitungsgrund.'; end if;
  if reply_author<>auth.uid() and not public.ec_is_admin() and not (post_scope='COMMUNITY' and public.ec_is_forum_moderator()) then raise exception 'Keine Moderationsberechtigung.'; end if;
  update public.forum_replies set content=trim(p_content), edited_at=now(), edited_by=auth.uid(), edit_reason=trim(p_reason) where id=p_reply_id;
end; $$;
create or replace function public.forum_delete_reply(p_reply_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare reply_author uuid; post_scope text;
begin
  select reply.author_id, post.scope into reply_author, post_scope from public.forum_replies reply join public.forum_posts post on post.id=reply.post_id where reply.id=p_reply_id;
  if reply_author is null then raise exception 'Antwort nicht gefunden.'; end if;
  if reply_author<>auth.uid() and not public.ec_is_admin() and not (post_scope='COMMUNITY' and public.ec_is_forum_moderator()) then raise exception 'Keine Moderationsberechtigung.'; end if;
  delete from public.forum_replies where id=p_reply_id;
end; $$;
create or replace function public.admin_set_forum_moderator(p_target_user uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Forum-Moderatoren verwalten.'; end if;
  if p_enabled and not exists(select 1 from public.profiles where id=p_target_user and role='SUPPORTER' and account_status='ACTIVE') then raise exception 'Nur aktive Supporter können Forum-Moderatoren werden.'; end if;
  update public.profiles set forum_moderator=p_enabled where id=p_target_user;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end; $$;
create or replace function public.forum_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare post_author uuid; post_scope text;
begin
  select author_id,scope into post_author,post_scope from public.forum_posts where id=p_post_id;
  if post_author is null then raise exception 'Beitrag nicht gefunden.'; end if;
  if post_author<>auth.uid() and not public.ec_is_admin() and not (post_scope='COMMUNITY' and public.ec_is_forum_moderator()) then raise exception 'Keine Moderationsberechtigung.'; end if;
  delete from public.forum_posts where id=p_post_id;
end; $$;

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
  values(auth.uid(),p_target_user,
    (select case role when 'HEAD_ADMIN' then '♛ ' when 'ADMIN' then '★ ' when 'SUPPORTER' then '★ ' else '' end || coalesce(nullif(nickname,''),'Community-Moderation') from public.profiles where id=auth.uid())
    || case when p_is_locked then ' hat dir folgende Funktion vorübergehend gesperrt: ' else ' hat dir folgende Funktion wieder freigegeben: ' end
    || case p_feature_key when 'FORUM_POSTING' then 'Im Forum schreiben' when 'MESSAGING' then 'Nachrichten senden' when 'FRIEND_REQUESTS' then 'Freundschaftsanfragen' else p_feature_key end
    || E'\n\nGrund: ' || trim(p_reason),false,now());
end;
$$;

revoke all on function public.admin_edit_forum_post(uuid,text,text,text) from public;
revoke all on function public.admin_set_feature_lock(uuid,text,boolean,text) from public;
grant execute on function public.admin_edit_forum_post(uuid,text,text,text) to authenticated;
grant execute on function public.admin_set_feature_lock(uuid,text,boolean,text) to authenticated;
grant execute on function public.forum_create_post(text,text,text,text,text,text) to authenticated;
grant execute on function public.forum_update_own_post(uuid,text,text) to authenticated;
grant execute on function public.forum_delete_post(uuid) to authenticated;
revoke all on function public.ec_is_forum_moderator() from public;
revoke all on function public.forum_create_reply(uuid,text) from public;
revoke all on function public.forum_update_reply(uuid,text,text) from public;
revoke all on function public.forum_delete_reply(uuid) from public;
revoke all on function public.admin_set_forum_moderator(uuid,boolean) from public;
grant execute on function public.ec_is_forum_moderator() to authenticated;
grant execute on function public.forum_create_reply(uuid,text) to authenticated;
grant execute on function public.forum_update_reply(uuid,text,text) to authenticated;
grant execute on function public.forum_delete_reply(uuid) to authenticated;
grant execute on function public.admin_set_forum_moderator(uuid,boolean) to authenticated;

-- One protected edit route for authors, the Head Admin and Community Forum
-- moderators.  This avoids relying on browser-side table update permissions.
create or replace function public.forum_update_post(p_post_id uuid, p_title text, p_content text, p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare post_author uuid; post_scope text; is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select author_id, scope into post_author, post_scope from public.forum_posts where id = p_post_id;
  if post_author is null then raise exception 'Beitrag nicht gefunden.'; end if;
  is_owner := post_author = auth.uid();
  if not is_owner and not public.ec_is_admin() and not (post_scope = 'COMMUNITY' and public.ec_is_forum_moderator()) then
    raise exception 'Keine Berechtigung zum Bearbeiten dieses Beitrags.';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 or char_length(trim(coalesce(p_content, ''))) < 3 then
    raise exception 'Überschrift und Beitrag müssen mindestens drei Zeichen enthalten.';
  end if;
  if not is_owner and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Bitte einen Bearbeitungsgrund angeben.';
  end if;
  update public.forum_posts
    set title = trim(p_title), content = trim(p_content), edited_at = now(), edited_by = auth.uid(),
        edit_reason = case when is_owner then 'Vom Autor bearbeitet' else trim(p_reason) end
    where id = p_post_id;
end;
$$;
revoke all on function public.forum_update_post(uuid,text,text,text) from public;
grant execute on function public.forum_update_post(uuid,text,text,text) to authenticated;

create or replace function public.forum_moderator_warn_user(p_target_user uuid, p_warning text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_forum_moderator() then raise exception 'Keine Forum-Moderationsberechtigung.'; end if;
  if p_target_user = auth.uid() or exists(select 1 from public.profiles where id=p_target_user and role in ('HEAD_ADMIN','ADMIN')) then raise exception 'Dieses Profil kann nicht von der Forum-Moderation verwarnt werden.'; end if;
  if char_length(trim(coalesce(p_warning,''))) < 3 then raise exception 'Bitte einen Verwarnungstext angeben.'; end if;
  insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
  values(auth.uid(),p_target_user,'Forum-Moderation: ' || trim(p_warning),false,now());
end;
$$;
revoke all on function public.forum_moderator_warn_user(uuid,text) from public;
grant execute on function public.forum_moderator_warn_user(uuid,text) to authenticated;
notify pgrst, 'reload schema';
