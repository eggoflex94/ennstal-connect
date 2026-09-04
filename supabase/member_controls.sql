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
alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to authenticated using (true);
drop policy if exists news_admin_write on public.news;
create policy news_admin_write on public.news for all to authenticated
using (public.ec_is_admin()) with check (public.ec_is_admin());

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
notify pgrst, 'reload schema';
