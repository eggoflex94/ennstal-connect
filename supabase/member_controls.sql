-- Ennstal Connect: reliable roles and automatic official notifications.
-- Run this AFTER forum_and_moderation.sql in the Supabase SQL Editor.

-- Compact personal history: only the owner (and a Head Admin) can read it.
create table if not exists public.profile_visits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id uuid not null references public.profiles(id) on delete cascade,
  visited_at timestamptz not null default now(),
  check (profile_id <> visitor_id)
);
create index if not exists profile_visits_profile_visited_idx on public.profile_visits(profile_id, visited_at desc);

alter table public.profile_visits enable row level security;
drop policy if exists profile_visits_read on public.profile_visits;
create policy profile_visits_read on public.profile_visits for select to authenticated
using (profile_id = auth.uid() or public.ec_is_head_admin());
drop policy if exists profile_visits_create on public.profile_visits;
create policy profile_visits_create on public.profile_visits for insert to authenticated
with check (visitor_id = auth.uid() and profile_id <> auth.uid());

-- The forum migration creates this table as well. These policies make the
-- activity list reliable when a database was set up in several stages.
alter table public.profile_activity enable row level security;
drop policy if exists profile_activity_read on public.profile_activity;
create policy profile_activity_read on public.profile_activity for select to authenticated
using (profile_id = auth.uid() or public.ec_is_head_admin());
drop policy if exists profile_activity_create on public.profile_activity;
create policy profile_activity_create on public.profile_activity for insert to authenticated
with check (profile_id = auth.uid() and actor_id = auth.uid());

-- News is readable by all signed-in members and writable only by admins.
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 160),
  content text not null check (char_length(content) between 3 and 10000),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.news add column if not exists author_id uuid references public.profiles(id) on delete set null;
alter table public.news add column if not exists updated_at timestamptz not null default now();
alter table public.news add column if not exists image_url text;
alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to authenticated using (true);
drop policy if exists news_admin_write on public.news;
create policy news_admin_write on public.news for all to authenticated
using (public.ec_is_admin()) with check (public.ec_is_admin());

-- The two configurable homepage frames are owned by the Head Admin.
create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  content text not null default '',
  image_url text,
  frame_style text not null default 'standard',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.homepage_sections add column if not exists image_url text;
alter table public.homepage_sections add column if not exists frame_style text not null default 'standard';
alter table public.homepage_sections add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.homepage_sections add column if not exists sort_order integer not null default 0;
alter table public.homepage_sections add column if not exists is_visible boolean not null default true;
alter table public.homepage_sections add column if not exists updated_at timestamptz not null default now();
alter table public.homepage_sections enable row level security;
drop policy if exists homepage_sections_read on public.homepage_sections;
create policy homepage_sections_read on public.homepage_sections for select to authenticated
using (is_visible or public.ec_is_head_admin());
drop policy if exists homepage_sections_head_admin_write on public.homepage_sections;
create policy homepage_sections_head_admin_write on public.homepage_sections for all to authenticated
using (public.ec_is_head_admin()) with check (public.ec_is_head_admin());

-- Individual administrator permissions: readable and editable by Head Admin
-- through RPC only, regardless of older table RLS policies.
create table if not exists public.user_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  manage_members boolean not null default false,
  manage_points boolean not null default false,
  manage_messages boolean not null default false,
  manage_media boolean not null default false,
  manage_roles boolean not null default false,
  manage_admins boolean not null default false,
  view_profile_visits boolean not null default false,
  manage_news boolean not null default false,
  manage_groups boolean not null default false,
  manage_events boolean not null default false,
  manage_marketplace boolean not null default false,
  manage_friend_requests boolean not null default false,
  manage_homepage boolean not null default false,
  manage_reports boolean not null default false
);

create or replace function public.admin_get_permissions(target_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Rechte einsehen.'; end if;
  select to_jsonb(p) - 'user_id' - 'updated_at' into v_result from public.user_permissions p where p.user_id = target_user;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_permissions(
  target_user uuid, p_manage_members boolean default false, p_manage_points boolean default false,
  p_manage_messages boolean default false, p_manage_media boolean default false, p_manage_roles boolean default false,
  p_manage_admins boolean default false, p_view_profile_visits boolean default false, p_manage_news boolean default false,
  p_manage_groups boolean default false, p_manage_events boolean default false, p_manage_marketplace boolean default false,
  p_manage_friend_requests boolean default false, p_manage_homepage boolean default false, p_manage_reports boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Berechtigungen ändern.'; end if;
  insert into public.user_permissions(user_id,manage_members,manage_points,manage_messages,manage_media,manage_roles,manage_admins,view_profile_visits,manage_news,manage_groups,manage_events,manage_marketplace,manage_friend_requests,manage_homepage,manage_reports)
  values(target_user,p_manage_members,p_manage_points,p_manage_messages,p_manage_media,p_manage_roles,p_manage_admins,p_view_profile_visits,p_manage_news,p_manage_groups,p_manage_events,p_manage_marketplace,p_manage_friend_requests,p_manage_homepage,p_manage_reports)
  on conflict(user_id) do update set
    manage_members=excluded.manage_members, manage_points=excluded.manage_points,
    manage_messages=excluded.manage_messages, manage_media=excluded.manage_media,
    manage_roles=excluded.manage_roles, manage_admins=excluded.manage_admins,
    view_profile_visits=excluded.view_profile_visits, manage_news=excluded.manage_news,
    manage_groups=excluded.manage_groups, manage_events=excluded.manage_events,
    manage_marketplace=excluded.manage_marketplace, manage_friend_requests=excluded.manage_friend_requests,
    manage_homepage=excluded.manage_homepage, manage_reports=excluded.manage_reports;
end;
$$;

create or replace function public.admin_set_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_role text;
  v_actor_name text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Head Admin darf Rollen vergeben oder entziehen.';
  end if;
  if target_user is null or target_user = auth.uid() then
    raise exception 'Die eigene Rolle kann nicht verändert werden.';
  end if;
  if new_role not in ('MEMBER','SUPPORTER','ADMIN') then
    raise exception 'Ungültige Rolle.';
  end if;

  select role into v_old_role from public.profiles where id = target_user for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_old_role = 'HEAD_ADMIN' then raise exception 'Die Head-Admin-Rolle ist geschützt.'; end if;

  update public.profiles set role = new_role::public.user_role where id = target_user;
  select case role when 'HEAD_ADMIN' then '♛ ' when 'ADMIN' then '★ ' when 'SUPPORTER' then '★ ' else '' end || coalesce(nullif(nickname,''),'Community-Moderation')
    into v_actor_name from public.profiles where id = auth.uid();

  insert into public.messages(sender_id, receiver_id, content, is_read, created_at)
  values (
    auth.uid(), target_user,
    v_actor_name || case
      when new_role = 'MEMBER' and v_old_role <> 'MEMBER' then ' hat dir die Rolle „' || case v_old_role when 'ADMIN' then 'Community Admin' when 'SUPPORTER' then 'Supporter' else v_old_role end || '“ entzogen.'
      when new_role = 'ADMIN' then ' hat dir die Rolle „Community Admin“ vergeben.'
      when new_role = 'SUPPORTER' then ' hat dir die Rolle „Supporter“ vergeben.'
      else ' hat deine Rolle aktualisiert.'
    end,
    false, now()
  );
end;
$$;

-- Editing a member's personal data must not overwrite the role/status with a
-- plain text value. Roles are changed exclusively through admin_set_role.
create or replace function public.admin_update_member(
  p_user_id uuid,
  p_nickname text,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_gender text,
  p_role text,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  if p_user_id is null then raise exception 'Mitglied nicht gefunden.'; end if;
  update public.profiles set
    nickname = nullif(trim(p_nickname), ''),
    first_name = nullif(trim(p_first_name), ''),
    last_name = nullif(trim(p_last_name), ''),
    birth_date = p_birth_date,
    gender = nullif(trim(p_gender), '')
  where id = p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end;
$$;

-- Registration addresses are deliberately exposed only inside the protected
-- admin directory; they are never returned to ordinary community members.
create or replace function public.admin_member_directory()
returns table(id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  return query select u.id, u.email::text from auth.users u order by u.email;
end;
$$;

revoke all on function public.admin_set_role(uuid,text) from public;
grant execute on function public.admin_set_role(uuid,text) to authenticated;
revoke all on function public.admin_update_member(uuid,text,text,text,date,text,text,text) from public;
grant execute on function public.admin_update_member(uuid,text,text,text,date,text,text,text) to authenticated;
revoke all on function public.admin_member_directory() from public;
grant execute on function public.admin_member_directory() to authenticated;
revoke all on function public.admin_get_permissions(uuid) from public;
grant execute on function public.admin_get_permissions(uuid) to authenticated;
revoke all on function public.admin_set_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public;
grant execute on function public.admin_set_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
