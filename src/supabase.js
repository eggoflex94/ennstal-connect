-- =========================================================
-- ENNSTAL CONNECT FINAL: ERWEITERUNGEN
-- Einmal komplett im Supabase SQL Editor ausführen.
-- Voraussetzung: public.profiles und auth.users existieren.
-- =========================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- PROFILE
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists age integer,
  add column if not exists bio text,
  add column if not exists location text,
  add column if not exists website text,
  add column if not exists interests text,
  add column if not exists avatar_url text,
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen timestamptz,
  add column if not exists community_points integer not null default 0,
  add column if not exists role text not null default 'MEMBER',
  add column if not exists status text not null default 'APPROVED';

alter table public.profiles
  alter column status set default 'APPROVED';

update public.profiles
set status='APPROVED'
where status is null or status in ('PENDING','PENDING_ADMIN');

-- ---------------------------------------------------------
-- ADMIN-RECHTE
-- ---------------------------------------------------------
create table if not exists public.user_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  manage_members boolean not null default false,
  manage_points boolean not null default false,
  manage_messages boolean not null default false,
  manage_media boolean not null default false,
  manage_roles boolean not null default false,
  manage_admins boolean not null default false,
  view_profile_visits boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- NACHRICHTEN
-- ---------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null default 'PRIVATE',
  title text,
  content text not null,
  points_delta integer,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_receiver_created_idx
  on public.messages(receiver_id, created_at desc);

-- ---------------------------------------------------------
-- PROFILMEDIEN
-- ---------------------------------------------------------
create table if not exists public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('IMAGE','YOUTUBE')),
  media_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- PROFILBESUCHE
-- ---------------------------------------------------------
create table if not exists public.profile_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references public.profiles(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visited_at timestamptz not null default now()
);

create index if not exists profile_visits_profile_time_idx
  on public.profile_visits(profile_id, visited_at desc);

-- ---------------------------------------------------------
-- PUNKTEVERLAUF
-- ---------------------------------------------------------
create table if not exists public.point_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- HILFSFUNKTION: RECHT PRÜFEN
-- ---------------------------------------------------------
create or replace function public.has_permission(permission_name text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  r text;
  allowed boolean;
begin
  select role into r from public.profiles where id=auth.uid();
  if r='HEAD_ADMIN' then return true; end if;
  if r is null then return false; end if;

  execute format(
    'select coalesce(%I,false) from public.user_permissions where user_id=$1',
    permission_name
  ) into allowed using auth.uid();

  return coalesce(allowed,false);
end;
$$;

grant execute on function public.has_permission(text) to authenticated;

-- ---------------------------------------------------------
-- ROLLE DIREKT ÜBER PROFIL SETZEN
-- HEAD_ADMIN darf alles.
-- ADMIN nur MEMBER <-> SUPPORTER, wenn manage_roles vorhanden.
-- ---------------------------------------------------------
create or replace function public.admin_set_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  actor_role text;
begin
  select role into actor_role from public.profiles where id=auth.uid();

  if actor_role='HEAD_ADMIN' then
    null;
  elsif public.has_permission('manage_roles') and new_role in ('MEMBER','SUPPORTER') then
    null;
  else
    raise exception 'Keine Berechtigung zum Ändern dieser Rolle.';
  end if;

  if new_role not in ('MEMBER','SUPPORTER','ADMIN','HEAD_ADMIN') then
    raise exception 'Ungültige Rolle.';
  end if;

  if target_user=auth.uid() and actor_role <> 'HEAD_ADMIN' then
    raise exception 'Du kannst deine eigene Rolle nicht ändern.';
  end if;

  update public.profiles set role=new_role where id=target_user;

  insert into public.user_permissions(user_id)
  values(target_user)
  on conflict(user_id) do nothing;

  if new_role='ADMIN' and actor_role='HEAD_ADMIN' then
    update public.user_permissions
    set manage_members=true, manage_points=true, manage_messages=true,
        manage_media=true, manage_roles=false, manage_admins=false,
        view_profile_visits=true, updated_at=now()
    where user_id=target_user;
  end if;

  if new_role in ('MEMBER','SUPPORTER') then
    update public.user_permissions
    set manage_members=false, manage_points=false, manage_messages=false,
        manage_media=false, manage_roles=false, manage_admins=false,
        view_profile_visits=false, updated_at=now()
    where user_id=target_user;
  end if;
end;
$$;

grant execute on function public.admin_set_role(uuid,text) to authenticated;

-- ---------------------------------------------------------
-- ADMIN-RECHTE SETZEN
-- Nur HEAD_ADMIN.
-- ---------------------------------------------------------
create or replace function public.admin_set_permissions(
  target_user uuid,
  p_manage_members boolean,
  p_manage_points boolean,
  p_manage_messages boolean,
  p_manage_media boolean,
  p_manage_roles boolean,
  p_manage_admins boolean,
  p_view_profile_visits boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role='HEAD_ADMIN'
  ) then
    raise exception 'Nur HEAD_ADMIN darf Admin-Rechte ändern.';
  end if;

  insert into public.user_permissions(
    user_id,manage_members,manage_points,manage_messages,
    manage_media,manage_roles,manage_admins,view_profile_visits,updated_at
  ) values(
    target_user,p_manage_members,p_manage_points,p_manage_messages,
    p_manage_media,p_manage_roles,p_manage_admins,p_view_profile_visits,now()
  )
  on conflict(user_id) do update set
    manage_members=excluded.manage_members,
    manage_points=excluded.manage_points,
    manage_messages=excluded.manage_messages,
    manage_media=excluded.manage_media,
    manage_roles=excluded.manage_roles,
    manage_admins=excluded.manage_admins,
    view_profile_visits=excluded.view_profile_visits,
    updated_at=now();
end;
$$;

grant execute on function public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

-- ---------------------------------------------------------
-- PUNKTE + VERLAUF + AUTOMATISCHE NACHRICHT
-- ---------------------------------------------------------
create or replace function public.admin_change_points(
  target_user uuid,
  delta integer,
  change_kind text,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.has_permission('manage_points') then
    raise exception 'Keine Berechtigung zur Punktevergabe.';
  end if;

  if delta=0 then raise exception 'Die Punkteänderung darf nicht 0 sein.'; end if;
  if coalesce(length(trim(reason_text)),0)<3 then
    raise exception 'Bitte einen Grund mit mindestens 3 Zeichen angeben.';
  end if;

  update public.profiles
  set community_points=greatest(0,coalesce(community_points,0)+delta)
  where id=target_user;

  if not found then raise exception 'Mitglied nicht gefunden.'; end if;

  insert into public.point_history(user_id,changed_by,delta,reason)
  values(target_user,auth.uid(),delta,trim(reason_text));

  insert into public.messages(
    sender_id,receiver_id,message_type,title,content,points_delta
  ) values(
    auth.uid(),target_user,'POINTS',
    case when delta>0 then 'Punkte erhalten' else 'Punkte geändert' end,
    case
      when delta>0 then
        'Du hast +'||delta||' Community-Punkte erhalten. Grund: '||trim(reason_text)
      else
        'Dir wurden '||abs(delta)||' Community-Punkte abgezogen. Grund: '||trim(reason_text)
    end,
    delta
  );
end;
$$;

grant execute on function public.admin_change_points(uuid,integer,text,text) to authenticated;

-- ---------------------------------------------------------
-- PRIVATE NACHRICHT SENDEN
-- ---------------------------------------------------------
create or replace function public.send_private_message(
  target_user uuid,
  message_text text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if target_user=auth.uid() then raise exception 'Du kannst dir selbst keine Nachricht senden.'; end if;
  if coalesce(length(trim(message_text)),0)=0 then raise exception 'Nachricht darf nicht leer sein.'; end if;

  insert into public.messages(sender_id,receiver_id,message_type,title,content)
  values(auth.uid(),target_user,'PRIVATE','Neue Nachricht',trim(message_text));
end;
$$;

grant execute on function public.send_private_message(uuid,text) to authenticated;

-- ---------------------------------------------------------
-- PROFILBESUCH: pro Besucher/Profil maximal einmal je 30 Minuten
-- ---------------------------------------------------------
create or replace function public.record_profile_visit(target_profile uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or target_profile=auth.uid() then return; end if;

  if exists (
    select 1 from public.profile_visits
    where visitor_id=auth.uid()
      and profile_id=target_profile
      and visited_at > now()-interval '30 minutes'
  ) then return; end if;

  insert into public.profile_visits(visitor_id,profile_id)
  values(auth.uid(),target_profile);
end;
$$;

grant execute on function public.record_profile_visit(uuid) to authenticated;

-- ---------------------------------------------------------
-- ONLINE STATUS
-- ---------------------------------------------------------
create or replace function public.update_online_status(online_status boolean default true)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.profiles
  set is_online=coalesce(online_status,false), last_seen=now()
  where id=auth.uid();

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

grant execute on function public.update_online_status(boolean) to authenticated;

-- ---------------------------------------------------------
-- AUTOMATISCHE PROFILERSTELLUNG
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(
    id,first_name,last_name,birth_date,nickname,
    role,status,is_online,last_seen,community_points
  )
  values(
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name','')),''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name','')),''),
    nullif(new.raw_user_meta_data->>'birth_date','')::date,
    nullif(trim(coalesce(new.raw_user_meta_data->>'nickname','')),''),
    'MEMBER','APPROVED',false,now(),0
  )
  on conflict(id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- STORAGE BUCKETS
-- ---------------------------------------------------------
insert into storage.buckets(id,name,public)
values ('avatars','avatars',true)
on conflict(id) do nothing;

insert into storage.buckets(id,name,public)
values ('profile-media','profile-media',true)
on conflict(id) do nothing;

commit;
