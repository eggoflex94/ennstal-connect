-- ENNSTAL CONNECT FINAL COMMUNITY FIX
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ===== SCHEMA REPAIR =====
alter table public.profiles add column if not exists role text not null default 'MEMBER';
alter table public.profiles add column if not exists account_status text not null default 'ACTIVE';
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_by uuid;
alter table public.profiles add column if not exists total_online_seconds bigint not null default 0;
alter table public.profiles add column if not exists last_online_at timestamptz;
alter table public.profiles add column if not exists last_reward_seconds bigint not null default 0;
alter table public.profiles add column if not exists reward_level integer not null default 0;
alter table public.profiles add column if not exists community_points integer not null default 0;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists is_online boolean not null default false;

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('ACTIVE','SUSPENDED'));

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('MEMBER','SUPPORTER','ADMIN','HEAD_ADMIN'));

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

create table if not exists public.point_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  amount integer not null,
  kind text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_status on public.profiles(account_status);
create index if not exists idx_blocks_blocked on public.user_blocks(blocked_id);
create index if not exists idx_messages_receiver_unread on public.messages(receiver_id, is_read);

-- ===== REMOVE OLD INCOMPATIBLE FUNCTIONS =====
drop function if exists public.get_admin_log(integer) cascade;
drop function if exists public.ensure_current_profile() cascade;
drop function if exists public.claim_initial_head_admin() cascade;
drop function if exists public.record_online_activity() cascade;
drop function if exists public.claim_online_reward() cascade;
drop function if exists public.admin_set_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) cascade;
drop function if exists public.mark_messages_read(uuid) cascade;
drop function if exists public.admin_change_points(uuid,integer,text,text) cascade;
drop function if exists public.admin_update_member(uuid,text,text,text,date,text,text,text) cascade;
drop function if exists public.admin_get_suspended_users() cascade;
drop function if exists public.admin_unsuspend_member(uuid) cascade;
drop function if exists public.admin_suspend_member(uuid,text) cascade;
drop function if exists public.admin_set_role(uuid,text) cascade;
drop function if exists public.admin_remove_profile_avatar(uuid) cascade;

-- ===== INTERNAL ROLE HELPERS =====
create or replace function public.ec_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('ADMIN','HEAD_ADMIN')
      and account_status = 'ACTIVE'
  );
$$;

create or replace function public.ec_is_head_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'HEAD_ADMIN'
      and account_status = 'ACTIVE'
  );
$$;

create or replace function public.ec_log(
  p_action text,
  p_target uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_log(actor_id, action, target_id, details)
  values (auth.uid(), p_action, p_target, coalesce(p_details,'{}'::jsonb));
end;
$$;

-- ===== PROFILE / REGISTRATION =====
create or replace function public.ensure_current_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_nickname text;
begin
  if auth.uid() is null then return; end if;

  select email, coalesce(raw_user_meta_data->>'nickname', split_part(email,'@',1))
  into v_email, v_nickname
  from auth.users where id = auth.uid();

  insert into public.profiles(id, nickname, role, account_status)
  values(auth.uid(), v_nickname, 'MEMBER', 'ACTIVE')
  on conflict (id) do nothing;
end;
$$;

create or replace function public.claim_initial_head_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_current_profile();

  if exists(select 1 from public.profiles where role='HEAD_ADMIN') then
    return false;
  end if;

  update public.profiles
  set role='HEAD_ADMIN'
  where id=auth.uid();

  perform public.ec_log('INITIAL_HEAD_ADMIN', auth.uid(), jsonb_build_object('message','Initialer Head Admin festgelegt'));
  return true;
end;
$$;

-- ===== ONLINE TIME / REWARDS =====
create or replace function public.record_online_activity()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_seconds integer := 60;
  v_now timestamptz := now();
begin
  perform public.ensure_current_profile();

  select * into v_profile from public.profiles where id=auth.uid() for update;
  if not found then return '{}'::jsonb; end if;

  if v_profile.last_online_at is not null then
    v_seconds := greatest(1, least(120, extract(epoch from (v_now - v_profile.last_online_at))::integer));
  end if;

  update public.profiles
  set total_online_seconds = coalesce(total_online_seconds,0) + v_seconds,
      last_online_at = v_now,
      is_online = true
  where id=auth.uid()
  returning * into v_profile;

  return jsonb_build_object(
    'total_online_seconds', v_profile.total_online_seconds,
    'last_reward_seconds', coalesce(v_profile.last_reward_seconds,0),
    'reward_level', coalesce(v_profile.reward_level,0)
  );
end;
$$;

create or replace function public.claim_online_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_available bigint;
  v_level integer;
begin
  select * into v_profile from public.profiles where id=auth.uid() for update;
  if not found then
    return jsonb_build_object('success',false,'message','Profil nicht gefunden.');
  end if;

  v_available := greatest(0, coalesce(v_profile.total_online_seconds,0) - coalesce(v_profile.last_reward_seconds,0));
  if v_available < 18000 then
    return jsonb_build_object('success',false,'message','Die Belohnung ist noch nicht verfügbar.');
  end if;

  v_level := coalesce(v_profile.reward_level,0)+1;

  update public.profiles
  set reward_level=v_level,
      last_reward_seconds=coalesce(last_reward_seconds,0)+18000
  where id=auth.uid();

  return jsonb_build_object(
    'success',true,
    'reward_level',v_level,
    'reward_label',format('Belohnungsstufe %s',v_level),
    'message',format('Belohnungsstufe %s wurde freigeschaltet!',v_level)
  );
end;
$$;

-- ===== MESSAGES =====
create or replace function public.mark_messages_read(p_sender uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.messages
  set is_read=true
  where receiver_id=auth.uid()
    and sender_id=p_sender
    and coalesce(is_read,false)=false;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- ===== ADMIN PERMISSIONS =====
create or replace function public.admin_set_permissions(
  target_user uuid,
  p_manage_members boolean,
  p_manage_points boolean,
  p_manage_messages boolean,
  p_manage_media boolean,
  p_manage_roles boolean,
  p_manage_admins boolean,
  p_view_profile_visits boolean,
  p_manage_news boolean,
  p_manage_groups boolean,
  p_manage_events boolean,
  p_manage_marketplace boolean,
  p_manage_friend_requests boolean,
  p_manage_homepage boolean,
  p_manage_reports boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Berechtigungen ändern.'; end if;
  insert into public.user_permissions(
    user_id,manage_members,manage_points,manage_messages,manage_media,manage_roles,
    manage_admins,view_profile_visits,manage_news,manage_groups,manage_events,
    manage_marketplace,manage_friend_requests,manage_homepage,manage_reports
  ) values (
    target_user,p_manage_members,p_manage_points,p_manage_messages,p_manage_media,p_manage_roles,
    p_manage_admins,p_view_profile_visits,p_manage_news,p_manage_groups,p_manage_events,
    p_manage_marketplace,p_manage_friend_requests,p_manage_homepage,p_manage_reports
  )
  on conflict(user_id) do update set
    manage_members=excluded.manage_members,
    manage_points=excluded.manage_points,
    manage_messages=excluded.manage_messages,
    manage_media=excluded.manage_media,
    manage_roles=excluded.manage_roles,
    manage_admins=excluded.manage_admins,
    view_profile_visits=excluded.view_profile_visits,
    manage_news=excluded.manage_news,
    manage_groups=excluded.manage_groups,
    manage_events=excluded.manage_events,
    manage_marketplace=excluded.manage_marketplace,
    manage_friend_requests=excluded.manage_friend_requests,
    manage_homepage=excluded.manage_homepage,
    manage_reports=excluded.manage_reports;
  perform public.ec_log('SET_PERMISSIONS',target_user);
end;
$$;

create or replace function public.admin_change_points(
  target_user uuid,
  delta integer,
  change_kind text,
  reason_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  if target_user is null or delta=0 then raise exception 'Ungültige Punkteänderung.'; end if;

  update public.profiles
  set community_points=greatest(0,coalesce(community_points,0)+delta)
  where id=target_user;

  insert into public.point_history(user_id,actor_id,amount,kind,reason)
  values(target_user,auth.uid(),delta,change_kind,reason_text);

  perform public.ec_log('CHANGE_POINTS',target_user,jsonb_build_object('delta',delta,'reason',reason_text));
end;
$$;

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
  if p_role='HEAD_ADMIN' and not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf diese Rolle vergeben.'; end if;
  if p_account_status='SUSPENDED' and p_user_id=auth.uid() then raise exception 'Du kannst dich nicht selbst sperren.'; end if;

  update public.profiles set
    nickname=nullif(trim(p_nickname),''),
    first_name=nullif(trim(p_first_name),''),
    last_name=nullif(trim(p_last_name),''),
    birth_date=p_birth_date,
    gender=nullif(trim(p_gender),''),
    role=case when p_role in ('MEMBER','SUPPORTER','ADMIN','HEAD_ADMIN') then p_role else role end,
    account_status=case when p_account_status in ('ACTIVE','SUSPENDED') then p_account_status else account_status end
  where id=p_user_id;

  perform public.ec_log('UPDATE_MEMBER',p_user_id);
end;
$$;

-- ===== SUSPEND / UNSUSPEND =====
create or replace function public.admin_get_suspended_users()
returns table(
  id uuid,
  nickname text,
  first_name text,
  last_name text,
  avatar_url text,
  role text,
  account_status text,
  suspension_reason text,
  suspended_at timestamptz,
  suspended_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  return query
  select p.id,p.nickname,p.first_name,p.last_name,p.avatar_url,p.role,p.account_status,
         p.suspension_reason,p.suspended_at,p.suspended_by
  from public.profiles p
  where p.account_status='SUSPENDED'
  order by p.suspended_at desc nulls last;
end;
$$;

create or replace function public.admin_suspend_member(target_user uuid, reason_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role text;
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  if target_user=auth.uid() then raise exception 'Du kannst dich nicht selbst sperren.'; end if;
  select role into v_role from public.profiles where id=target_user for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_role='HEAD_ADMIN' then raise exception 'Der Head Admin kann nicht gesperrt werden.'; end if;
  if length(trim(coalesce(reason_text,'')))<5 then raise exception 'Bitte einen konkreten Sperrgrund angeben.'; end if;

  update public.profiles
  set account_status='SUSPENDED',
      suspension_reason=trim(reason_text),
      suspended_at=now(),
      suspended_by=auth.uid(),
      is_online=false
  where id=target_user;

  perform public.ec_log('SUSPEND_MEMBER',target_user,jsonb_build_object('reason',trim(reason_text)));
end;
$$;

create or replace function public.admin_unsuspend_member(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;

  update public.profiles
  set account_status='ACTIVE',
      suspension_reason=null,
      suspended_at=null,
      suspended_by=null
  where id=target_user;

  perform public.ec_log('UNSUSPEND_MEMBER',target_user);
end;
$$;

-- ===== ROLES / AVATAR =====
create or replace function public.admin_set_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_role not in ('MEMBER','SUPPORTER','ADMIN','HEAD_ADMIN') then raise exception 'Ungültige Rolle.'; end if;
  if new_role='HEAD_ADMIN' and not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf diese Rolle vergeben.'; end if;
  if new_role in ('ADMIN','HEAD_ADMIN') and not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Admin-Rollen vergeben.'; end if;
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;

  update public.profiles set role=new_role where id=target_user;
  perform public.ec_log('SET_ROLE',target_user,jsonb_build_object('role',new_role));
end;
$$;

create or replace function public.admin_remove_profile_avatar(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  update public.profiles set avatar_url=null where id=target_user;
  perform public.ec_log('REMOVE_AVATAR',target_user);
end;
$$;

-- ===== ADMIN LOG =====
create or replace function public.get_admin_log(p_limit integer default 100)
returns table(
  id uuid,
  actor_id uuid,
  action text,
  target_id uuid,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf das Logbuch sehen.'; end if;
  return query
  select l.id,l.actor_id,l.action,l.target_id,l.details,l.created_at
  from public.admin_log l
  order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),500));
end;
$$;

-- ===== REGISTER TRIGGER =====
create or replace function public.ec_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,nickname,role,account_status)
  values(new.id,coalesce(new.raw_user_meta_data->>'nickname',split_part(new.email,'@',1)),'MEMBER','ACTIVE')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.ec_handle_new_user();

-- ===== PROFILE VISIBILITY: suspended accounts and mutual blocks =====
alter table public.profiles enable row level security;

drop policy if exists "ec_profiles_visible" on public.profiles;
create policy "ec_profiles_visible"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    account_status = 'ACTIVE'
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = profiles.id)
         or (b.blocker_id = profiles.id and b.blocked_id = auth.uid())
    )
  )
  or public.ec_is_admin()
);

-- Users still update only themselves through normal client calls.
drop policy if exists "ec_profiles_self_update" on public.profiles;
create policy "ec_profiles_self_update"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant execute on function public.ensure_current_profile() to authenticated;
grant execute on function public.claim_initial_head_admin() to authenticated;
grant execute on function public.record_online_activity() to authenticated;
grant execute on function public.claim_online_reward() to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
grant execute on function public.admin_set_permissions(uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.admin_change_points(uuid,integer,text,text) to authenticated;
grant execute on function public.admin_update_member(uuid,text,text,text,date,text,text,text) to authenticated;
grant execute on function public.admin_get_suspended_users() to authenticated;
grant execute on function public.admin_suspend_member(uuid,text) to authenticated;
grant execute on function public.admin_unsuspend_member(uuid) to authenticated;
grant execute on function public.admin_set_role(uuid,text) to authenticated;
grant execute on function public.admin_remove_profile_avatar(uuid) to authenticated;
grant execute on function public.get_admin_log(integer) to authenticated;

notify pgrst, 'reload schema';

-- ===== ADMIN HIDDEN ACCOUNTS, AUDIT LOG & RULE ACCEPTANCE =====
create table if not exists public.community_rule_acceptances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  rules_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, rules_version)
);
alter table public.community_rule_acceptances enable row level security;
drop policy if exists "rule_acceptance_read_own_or_admin" on public.community_rule_acceptances;
create policy "rule_acceptance_read_own_or_admin" on public.community_rule_acceptances
for select to authenticated using ((select auth.uid()) = user_id or public.ec_is_admin());
revoke all on table public.community_rule_acceptances from anon, authenticated;
grant select on table public.community_rule_acceptances to authenticated;

create or replace function public.accept_community_rules(p_rules_version text)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_accepted_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich.'; end if;
  if p_rules_version is distinct from '2026-09-05' then raise exception 'Diese Regelversion ist nicht aktuell.'; end if;
  insert into public.community_rule_acceptances(user_id,rules_version)
  values(auth.uid(),p_rules_version)
  on conflict(user_id,rules_version) do update set rules_version=excluded.rules_version
  returning accepted_at into v_accepted_at;
  return v_accepted_at;
end;
$$;
revoke all on function public.accept_community_rules(text) from public;
grant execute on function public.accept_community_rules(text) to authenticated;

drop function if exists public.admin_full_member_directory();
create function public.admin_full_member_directory()
returns table(id uuid,nickname text,role text,account_status text,is_test_account boolean,avatar_url text,account_badge text,rules_version text,rules_accepted_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  return query
  select p.id,p.nickname,p.role::text,p.account_status,coalesce(p.is_test_account,false),p.avatar_url,p.account_badge,a.rules_version,a.accepted_at
  from public.profiles p
  left join lateral (
    select x.rules_version,x.accepted_at from public.community_rule_acceptances x
    where x.user_id=p.id order by x.accepted_at desc limit 1
  ) a on true
  order by case p.role when 'HEAD_ADMIN' then 1 when 'ADMIN' then 2 when 'SUPPORTER' then 3 else 4 end,lower(p.nickname);
end;
$$;
revoke all on function public.admin_full_member_directory() from public;
grant execute on function public.admin_full_member_directory() to authenticated;

create or replace function public.get_admin_log(p_limit integer default 200)
returns table(id uuid,actor_id uuid,action text,target_id uuid,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Global Admin darf das Logbuch sehen.'; end if;
  return query select l.id,l.actor_id,l.action,l.target_id,l.details,l.created_at
  from public.admin_log l order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
end;
$$;
revoke all on function public.get_admin_log(integer) from public;
grant execute on function public.get_admin_log(integer) to authenticated;
revoke execute on function public.accept_community_rules(text) from anon;
revoke execute on function public.admin_full_member_directory() from anon;
revoke execute on function public.get_admin_log(integer) from anon;
notify pgrst,'reload schema';
