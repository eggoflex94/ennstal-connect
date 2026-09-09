-- Ennstal Connect regional community foundation
-- Regions, home-region membership, scoped regional admins and effective-role helpers.

create extension if not exists pgcrypto;

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  description text,
  accent text not null default '#ff8a00',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.regions (slug,name,short_name,description,accent,sort_order)
values
  ('ennstal','Ennstal','Ennstal','Region Ennstal und angrenzende Orte.','#ff8a00',10),
  ('leoben-bruck-muerzzuschlag','Leoben – Bruck – Mürzzuschlag','LBM','Region Leoben, Bruck an der Mur und Mürzzuschlag.','#f04a23',20),
  ('ueberregional','Überregional','Überregional','Salzkammergut und alle Orte außerhalb der beiden Kernregionen Ennstal und Leoben – Bruck – Mürzzuschlag.','#5b6b7a',30)
on conflict (slug) do update set name=excluded.name,short_name=excluded.short_name,description=excluded.description,accent=excluded.accent,sort_order=excluded.sort_order,is_active=true;

-- Salzkammergut bleibt nur als historische Referenz bestehen und darf durch ein erneutes
-- Ausführen der Foundation niemals wieder als aktive, auswählbare Region erscheinen.
update public.regions
set is_active=false,
    description='Historische Region; Mitglieder und Inhalte gehören zu Überregional.'
where slug='salzkammergut';

alter table public.profiles add column if not exists home_region_id uuid references public.regions(id);
alter table public.profiles add column if not exists home_region_changed_at timestamptz;
update public.profiles p set home_region_id=r.id from public.regions r where p.home_region_id is null and r.slug='ennstal';
create index if not exists profiles_home_region_idx on public.profiles(home_region_id);

create table if not exists public.regional_admin_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  granted_by uuid not null references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,region_id)
);
create index if not exists regional_admin_region_idx on public.regional_admin_assignments(region_id) where active;

alter table public.regions enable row level security;
alter table public.regional_admin_assignments enable row level security;
drop policy if exists regions_read on public.regions;
create policy regions_read on public.regions for select using(true);
drop policy if exists regional_admin_assignments_read on public.regional_admin_assignments;
create policy regional_admin_assignments_read on public.regional_admin_assignments for select using(auth.uid() is not null);

create or replace function public.ec_role_text(p_user uuid default auth.uid()) returns text language sql stable security definer set search_path=public as $$ select upper(coalesce(role::text,'MEMBER')) from public.profiles where id=p_user; $$;
create or replace function public.ec_is_head_admin_user(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.ec_role_text(p_user)='HEAD_ADMIN',false); $$;
create or replace function public.ec_is_global_admin_user(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.ec_role_text(p_user) in ('HEAD_ADMIN','ADMIN'),false); $$;
create or replace function public.ec_is_regional_admin(p_region uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.regional_admin_assignments a where a.user_id=p_user and a.region_id=p_region and a.active); $$;
create or replace function public.ec_can_admin_region(p_region uuid,p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public as $$ select public.ec_is_global_admin_user(p_user) or public.ec_is_regional_admin(p_region,p_user); $$;

create or replace function public.ec_effective_role_for(p_user uuid,p_region uuid) returns text language plpgsql stable security definer set search_path=public as $$
declare base_role text; has_regional boolean;
begin
  base_role:=public.ec_role_text(p_user);
  if base_role='HEAD_ADMIN' then return 'HEAD_ADMIN'; end if;
  if base_role='ADMIN' then return 'ADMIN'; end if;
  if public.ec_is_regional_admin(p_region,p_user) then return 'ADMIN'; end if;
  select exists(select 1 from public.regional_admin_assignments a where a.user_id=p_user and a.active) into has_regional;
  if has_regional then return 'SUPPORTER'; end if;
  if base_role='SUPPORTER' then return 'SUPPORTER'; end if;
  return 'MEMBER';
end; $$;

create or replace function public.ec_set_regional_admin(p_target uuid,p_region_slug text,p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$
declare region_uuid uuid; target_role text;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Regionaladmins vergeben.'; end if;
  select id into region_uuid from public.regions where slug=p_region_slug and is_active;
  if region_uuid is null then raise exception 'Region nicht gefunden.'; end if;
  target_role:=public.ec_role_text(p_target);
  if target_role='HEAD_ADMIN' then raise exception 'Der Hauptadmin braucht keine Regionalzuweisung.'; end if;
  if p_enabled then
    insert into public.regional_admin_assignments(user_id,region_id,granted_by,active,updated_at) values(p_target,region_uuid,auth.uid(),true,now()) on conflict(user_id,region_id) do update set active=true,granted_by=excluded.granted_by,updated_at=now();
    update public.profiles set role='SUPPORTER' where id=p_target and upper(role::text)='MEMBER';
  else update public.regional_admin_assignments set active=false,updated_at=now() where user_id=p_target and region_id=region_uuid;
  end if;
end; $$;

create or replace function public.ec_set_global_admin(p_target uuid,p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Globaladmins vergeben.'; end if;
  if p_target=auth.uid() then raise exception 'Die eigene Hauptadmin-Rolle kann hier nicht geändert werden.'; end if;
  if public.ec_role_text(p_target)='HEAD_ADMIN' then raise exception 'Hauptadmin kann nicht geändert werden.'; end if;
  if p_enabled then update public.profiles set role='ADMIN' where id=p_target;
  elsif exists(select 1 from public.regional_admin_assignments where user_id=p_target and active) then update public.profiles set role='SUPPORTER' where id=p_target;
  else update public.profiles set role='MEMBER' where id=p_target;
  end if;
end; $$;

create or replace function public.ec_change_home_region(p_region_slug text) returns uuid language plpgsql security definer set search_path=public as $$
declare region_uuid uuid; last_change timestamptz;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  select id into region_uuid from public.regions where slug=p_region_slug and is_active;
  if region_uuid is null then raise exception 'Region nicht gefunden.'; end if;
  select home_region_changed_at into last_change from public.profiles where id=auth.uid();
  if last_change is not null and last_change>now()-interval '30 days' and not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Die Heimatregion kann nur alle 30 Tage geändert werden.'; end if;
  update public.profiles set home_region_id=region_uuid,home_region_changed_at=now() where id=auth.uid();
  return region_uuid;
end; $$;

create or replace function public.ec_head_set_home_region(p_target uuid,p_region_slug text) returns uuid language plpgsql security definer set search_path=public as $$
declare region_uuid uuid;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Heimatregionen administrativ ändern.'; end if;
  select id into region_uuid from public.regions where slug=p_region_slug and is_active;
  if region_uuid is null then raise exception 'Region nicht gefunden.'; end if;
  update public.profiles set home_region_id=region_uuid,home_region_changed_at=now() where id=p_target;
  return region_uuid;
end; $$;

create or replace view public.ec_member_directory as select p.*,r.slug home_region_slug,r.name home_region_name,r.short_name home_region_short_name from public.profiles p left join public.regions r on r.id=p.home_region_id;

-- Default member directory is home-region only. Passing NULL intentionally requests all regions.
create or replace function public.ec_members_for_directory(p_region uuid default null)
returns setof public.ec_member_directory language sql stable security definer set search_path=public as $$
  select d.* from public.ec_member_directory d
  where d.home_region_id=coalesce(p_region,(select home_region_id from public.profiles where id=auth.uid()))
  order by d.nickname nulls last,d.first_name nulls last;
$$;
create or replace function public.ec_members_all_regions()
returns setof public.ec_member_directory language sql stable security definer set search_path=public as $$ select * from public.ec_member_directory order by home_region_name,nickname nulls last,first_name nulls last; $$;

-- Regional homepage/community content. Existing records are assigned to Ennstal during migration.
do $$ declare ennstal_id uuid; tbl text;
begin
  select id into ennstal_id from public.regions where slug='ennstal';
  foreach tbl in array array['forum_posts','community_groups','news','community_news','community_events','events','community_ads','community_weekly_polls'] loop
    if to_regclass('public.'||tbl) is not null then
      execute format('alter table public.%I add column if not exists region_id uuid references public.regions(id)',tbl);
      execute format('update public.%I set region_id=%L where region_id is null',tbl,ennstal_id);
      execute format('create index if not exists %I on public.%I(region_id)',tbl||'_region_idx',tbl);
    end if;
  end loop;
end $$;

create or replace function public.ec_region_news(p_region uuid) returns setof public.community_news language sql stable security definer set search_path=public as $$ select * from public.community_news where region_id=p_region order by created_at desc; $$;
create or replace function public.ec_region_events(p_region uuid) returns setof public.community_events language sql stable security definer set search_path=public as $$ select * from public.community_events where region_id=p_region order by event_at asc; $$;
create or replace function public.ec_region_weekly_polls(p_region uuid) returns setof public.community_weekly_polls language sql stable security definer set search_path=public as $$ select * from public.community_weekly_polls where region_id=p_region and is_active=true order by created_at desc; $$;

grant select on public.regions to authenticated,anon;
grant select on public.regional_admin_assignments to authenticated;
grant select on public.ec_member_directory to authenticated;
grant execute on function public.ec_effective_role_for(uuid,uuid) to authenticated;
grant execute on function public.ec_can_admin_region(uuid,uuid) to authenticated;
grant execute on function public.ec_set_regional_admin(uuid,text,boolean) to authenticated;
grant execute on function public.ec_set_global_admin(uuid,boolean) to authenticated;
grant execute on function public.ec_change_home_region(text) to authenticated;
grant execute on function public.ec_head_set_home_region(uuid,text) to authenticated;
grant execute on function public.ec_members_for_directory(uuid) to authenticated;
grant execute on function public.ec_members_all_regions() to authenticated;
grant execute on function public.ec_region_news(uuid) to authenticated;
grant execute on function public.ec_region_events(uuid) to authenticated;
grant execute on function public.ec_region_weekly_polls(uuid) to authenticated;
