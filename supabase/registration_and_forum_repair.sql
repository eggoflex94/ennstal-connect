-- Ennstal Connect: registration + forum edit repair
-- Run this file ONCE by itself in the Supabase SQL Editor.
-- It replaces only app-created signup triggers and makes no changes to auth users.

-- A profile must be created at signup with every required base value. Older
-- project versions inserted only id/nickname, which causes Auth to surface the
-- misleading message "Database error saving new user".
create or replace function public.ec_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
  v_birth_date date;
  v_first_admin boolean;
begin
  v_nickname := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), '');
  if v_nickname is null then
    v_nickname := split_part(coalesce(new.email, ''), '@', 1);
  end if;
  if char_length(v_nickname) < 3 then
    raise exception 'Nickname muss mindestens drei Zeichen haben.';
  end if;

  -- Prevent a race between the availability check and Auth signup without
  -- relying on a possibly missing legacy unique index.
  perform pg_advisory_xact_lock(hashtext('ennstal-nickname:' || lower(v_nickname)));
  if exists (
    select 1 from public.profiles
    where lower(btrim(coalesce(nickname, ''))) = lower(v_nickname)
  ) then
    raise exception 'Dieser Nickname ist bereits vergeben.';
  end if;

  v_birth_date := case
    when coalesce(new.raw_user_meta_data ->> 'birth_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (new.raw_user_meta_data ->> 'birth_date')::date
    else date '2000-01-01'
  end;

  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  select not exists (
    select 1 from public.profiles where role in ('ADMIN', 'HEAD_ADMIN')
  ) into v_first_admin;

  insert into public.profiles (
    id, nickname, first_name, last_name, birth_date, gender, role, account_status
  ) values (
    new.id,
    v_nickname,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    v_birth_date,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'gender', '')), ''),
    case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,
    'ACTIVE'
  ) on conflict (id) do nothing;

  return new;
end;
$$;

-- There must be exactly one application signup trigger. Supabase's internal
-- triggers are retained; only non-internal project triggers are replaced.
do $$
declare trigger_row record;
begin
  for trigger_row in
    select tgname from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_row.tgname);
  end loop;
end;
$$;

create trigger ennstal_connect_profile_on_signup
after insert on auth.users
for each row execute procedure public.ec_handle_new_user();

revoke all on function public.ec_handle_new_user() from public;

-- A protected server-side edit route. Authors can edit their own posts;
-- Admins can edit both forums; appointed Supporters can edit Community posts.
alter table public.profiles add column if not exists forum_moderator boolean not null default false;
alter table public.forum_posts add column if not exists edited_at timestamptz;
alter table public.forum_posts add column if not exists edited_by uuid references public.profiles(id) on delete set null;
alter table public.forum_posts add column if not exists edit_reason text;

create or replace function public.forum_update_post(
  p_post_id uuid,
  p_title text,
  p_content text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_scope text;
  v_role text;
  v_forum_moderator boolean;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Nicht eingeloggt.';
  end if;
  select author_id, scope into v_author_id, v_scope
  from public.forum_posts where id = p_post_id;
  if v_author_id is null then
    raise exception 'Beitrag nicht gefunden.';
  end if;
  select role, coalesce(forum_moderator, false)
  into v_role, v_forum_moderator
  from public.profiles where id = auth.uid();
  v_is_owner := v_author_id = auth.uid();
  if not v_is_owner
     and coalesce(v_role, 'MEMBER') not in ('ADMIN', 'HEAD_ADMIN')
     and not (v_scope = 'COMMUNITY' and coalesce(v_forum_moderator, false)) then
    raise exception 'Keine Berechtigung zum Bearbeiten dieses Beitrags.';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3
     or char_length(btrim(coalesce(p_content, ''))) < 3 then
    raise exception 'Überschrift und Beitrag müssen mindestens drei Zeichen enthalten.';
  end if;
  if not v_is_owner and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Bitte einen Bearbeitungsgrund angeben.';
  end if;

  update public.forum_posts
  set title = btrim(p_title),
      content = btrim(p_content),
      edited_at = now(),
      edited_by = auth.uid(),
      edit_reason = case
        when v_is_owner then 'Vom Autor bearbeitet'
        else btrim(p_reason)
      end
  where id = p_post_id;
end;
$$;

revoke all on function public.forum_update_post(uuid, text, text, text) from public;
grant execute on function public.forum_update_post(uuid, text, text, text) to authenticated;

-- Profile verification. The columns are deliberately created before the
-- functions: an older SQL version declared its functions first and therefore
-- left this feature only half-installed.
create extension if not exists pgcrypto;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists verification_required_at timestamptz;
alter table public.profiles add column if not exists verification_due_at timestamptz;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DECLINED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique(user_id, status)
);
alter table public.verification_requests enable row level security;
drop policy if exists verification_requests_read on public.verification_requests;
create policy verification_requests_read on public.verification_requests
for select to authenticated
using (user_id = auth.uid() or public.ec_is_head_admin());

create or replace function public.request_profile_verification(p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_head_admin uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_verified) then
    raise exception 'Dein Profil ist bereits verifiziert.';
  end if;
  if exists (select 1 from public.verification_requests where user_id = auth.uid() and status = 'PENDING') then
    raise exception 'Deine Verifizierungsanfrage wird bereits geprüft.';
  end if;
  insert into public.verification_requests(user_id, note)
  values (auth.uid(), left(btrim(coalesce(p_note, '')), 1000));
  select id into v_head_admin from public.profiles
  where role = 'HEAD_ADMIN' and account_status = 'ACTIVE' limit 1;
  select coalesce(nullif(nickname, ''), 'Ein Mitglied') into v_name
  from public.profiles where id = auth.uid();
  if v_head_admin is not null and v_head_admin <> auth.uid() then
    insert into public.messages(sender_id, receiver_id, content, is_read, created_at)
    values (auth.uid(), v_head_admin, v_name || ' hat eine Verifizierungsanfrage gestellt.', false, now());
  end if;
end;
$$;

create or replace function public.admin_verification_review_queue()
returns table(user_id uuid, nickname text, due_at timestamptz, reason text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  return query
  select p.id, coalesce(nullif(p.nickname, ''), 'Mitglied'), p.verification_due_at,
         coalesce(r.note, 'Mitglied hat eine Verifizierung angefordert.')
  from public.verification_requests r
  join public.profiles p on p.id = r.user_id
  where r.status = 'PENDING'
  order by r.created_at asc;
end;
$$;

create or replace function public.admin_review_profile_verification(
  p_user_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Head Admin darf Verifizierungsanfragen abschließen.';
  end if;
  if not exists (select 1 from public.verification_requests where user_id = p_user_id and status = 'PENDING') then
    raise exception 'Keine offene Verifizierungsanfrage gefunden.';
  end if;
  update public.verification_requests
  set status = case when p_approved then 'APPROVED' else 'DECLINED' end,
      reviewed_at = now(), reviewed_by = auth.uid()
  where user_id = p_user_id and status = 'PENDING';
  update public.profiles
  set is_verified = p_approved,
      verified_at = case when p_approved then now() else null end,
      verified_by = case when p_approved then auth.uid() else null end,
      verification_required_at = null,
      verification_due_at = null
  where id = p_user_id;
end;
$$;

revoke all on function public.request_profile_verification(text) from public;
revoke all on function public.admin_verification_review_queue() from public;
revoke all on function public.admin_review_profile_verification(uuid, boolean) from public;
grant execute on function public.request_profile_verification(text) to authenticated;
grant execute on function public.admin_verification_review_queue() to authenticated;
grant execute on function public.admin_review_profile_verification(uuid, boolean) to authenticated;

-- Public profile updates. This replaces the older activity-only logger so a
-- successful profile save is also visible on the Community page when the
-- member kept activity visibility public.
alter table public.profiles add column if not exists privacy_settings jsonb not null default '{"name":"PUBLIC","activity":"PUBLIC"}'::jsonb;
create table if not exists public.public_profile_updates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null,
  role text not null,
  account_badge text not null default 'STANDARD',
  is_verified boolean not null default false,
  avatar_url text,
  activity_type text not null,
  created_at timestamptz not null default now()
);
alter table public.public_profile_updates add column if not exists account_badge text not null default 'STANDARD';
alter table public.public_profile_updates enable row level security;
drop policy if exists public_profile_updates_read on public.public_profile_updates;
create policy public_profile_updates_read on public.public_profile_updates for select to anon, authenticated using (true);
revoke all on public.public_profile_updates from public;
grant select on public.public_profile_updates to anon, authenticated;

create or replace function public.log_profile_change(p_activity text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Profil nicht gefunden.'; end if;
  insert into public.profile_activity(profile_id, actor_id, activity_type)
  values (p.id, p.id, left(btrim(coalesce(p_activity, 'Profil aktualisiert')), 120));
  if coalesce(p.privacy_settings ->> 'activity', 'PUBLIC') = 'PUBLIC' then
    insert into public.public_profile_updates(profile_id, nickname, role, account_badge, is_verified, avatar_url, activity_type)
    values (p.id,
      case when coalesce(p.privacy_settings ->> 'name', 'PUBLIC') = 'PUBLIC' then coalesce(nullif(p.nickname, ''), 'Mitglied') else 'Privates Mitglied' end,
      coalesce(p.role, 'MEMBER'), coalesce(p.account_badge, 'STANDARD'), coalesce(p.is_verified, false), p.avatar_url,
      left(btrim(coalesce(p_activity, 'Profil aktualisiert')), 120));
  end if;
end;
$$;
revoke all on function public.log_profile_change(text) from public;
grant execute on function public.log_profile_change(text) to authenticated;

-- The feed is also written directly by the profile table. This is a reliable
-- fallback when a mobile browser ends a request immediately after saving the
-- form and therefore never reaches the follow-up RPC above.
create or replace function public.ec_publish_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_activity text;
begin
  if coalesce(new.privacy_settings ->> 'activity', 'PUBLIC') <> 'PUBLIC' then
    return new;
  end if;
  v_activity := case
    when old.nickname is distinct from new.nickname then 'Nickname geändert'
    when old.avatar_url is distinct from new.avatar_url then 'Profilbild geändert'
    when old.profile_background is distinct from new.profile_background then 'Hintergrund aktualisiert'
    when old.profile_layout is distinct from new.profile_layout then 'Profil-Layout geändert'
    when old.bio is distinct from new.bio then 'Über-mich-Text aktualisiert'
    when old.location is distinct from new.location then 'Wohnort aktualisiert'
    when old.interests is distinct from new.interests then 'Interessen aktualisiert'
    when old.website is distinct from new.website then 'Webseite aktualisiert'
    when old.profile_accent is distinct from new.profile_accent then 'Profil gestaltet'
    else null
  end;
  if v_activity is null then return new; end if;
  insert into public.public_profile_updates(profile_id, nickname, role, account_badge, is_verified, avatar_url, activity_type)
  values (
    new.id,
    case when coalesce(new.privacy_settings ->> 'name', 'PUBLIC') = 'PUBLIC' then coalesce(nullif(new.nickname, ''), 'Mitglied') else 'Privates Mitglied' end,
    coalesce(new.role, 'MEMBER'), coalesce(new.account_badge, 'STANDARD'), coalesce(new.is_verified, false), new.avatar_url, v_activity
  );
  return new;
end;
$$;
drop trigger if exists ennstal_connect_profile_update_feed on public.profiles;
create trigger ennstal_connect_profile_update_feed
after update of nickname, avatar_url, profile_background, profile_layout, bio, location, interests, website, profile_accent on public.profiles
for each row execute procedure public.ec_publish_profile_update();
revoke all on function public.ec_publish_profile_update() from public;

-- Creating a community advert is protected on the server, independently of
-- RLS policy versions. The image URL is supplied only after the browser has
-- uploaded the selected file to the existing image bucket.
create table if not exists public.community_ads (
  id uuid primary key default gen_random_uuid(), title text not null,
  body text not null default '', image_url text, link_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function public.admin_create_community_ad(
  p_title text, p_body text default '', p_link_url text default null, p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Werbeflächen veröffentlichen.'; end if;
  if char_length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Der Name muss mindestens drei Zeichen haben.'; end if;
  insert into public.community_ads(title, body, link_url, image_url, created_by)
  values (btrim(p_title), btrim(coalesce(p_body, '')), nullif(btrim(coalesce(p_link_url, '')), ''), nullif(btrim(coalesce(p_image_url, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.admin_create_community_ad(text, text, text, text) from public;
grant execute on function public.admin_create_community_ad(text, text, text, text) to authenticated;

create or replace function public.admin_delete_community_ad(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Werbeflächen entfernen.'; end if;
  delete from public.community_ads where id = p_ad_id;
  if not found then raise exception 'Werbefläche nicht gefunden.'; end if;
end;
$$;
revoke all on function public.admin_delete_community_ad(uuid) from public;
grant execute on function public.admin_delete_community_ad(uuid) to authenticated;
notify pgrst, 'reload schema';
