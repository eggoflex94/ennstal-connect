-- Regional moderation scopes for Ennstal Connect supporters.
-- Supporters can be assigned forum and/or group moderation independently per region.

create table if not exists public.regional_moderator_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  forum_moderator boolean not null default false,
  group_moderator boolean not null default false,
  active boolean not null default true,
  granted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, region_id),
  check (forum_moderator or group_moderator or not active)
);

create index if not exists regional_moderator_region_idx
  on public.regional_moderator_assignments(region_id)
  where active;

alter table public.regional_moderator_assignments enable row level security;
drop policy if exists regional_moderator_assignments_read on public.regional_moderator_assignments;
create policy regional_moderator_assignments_read
  on public.regional_moderator_assignments for select to authenticated
  using (true);

-- Preserve existing global moderator settings by assigning them to the supporter's
-- current home region once. Future changes should use the regional RPC below.
insert into public.regional_moderator_assignments(
  user_id, region_id, forum_moderator, group_moderator, active, granted_by
)
select p.id, p.home_region_id, coalesce(p.forum_moderator,false), coalesce(p.group_moderator,false), true,
       coalesce((select id from public.profiles where role='HEAD_ADMIN' and account_status='ACTIVE' order by created_at limit 1), p.id)
from public.profiles p
where p.role='SUPPORTER'
  and p.home_region_id is not null
  and (coalesce(p.forum_moderator,false) or coalesce(p.group_moderator,false))
on conflict (user_id, region_id) do nothing;

create or replace function public.ec_sync_legacy_moderator_flags(p_target uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.profiles p
  set forum_moderator = exists(
        select 1 from public.regional_moderator_assignments a
        where a.user_id=p_target and a.active and a.forum_moderator
      ),
      group_moderator = exists(
        select 1 from public.regional_moderator_assignments a
        where a.user_id=p_target and a.active and a.group_moderator
      )
  where p.id=p_target;
end;
$$;

create or replace function public.ec_set_regional_moderator(
  p_target uuid,
  p_region_slug text,
  p_forum boolean default false,
  p_groups boolean default false,
  p_enabled boolean default true
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_region uuid;
  v_role text;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then
    raise exception 'Nur der Hauptadmin darf regionale Moderationsrechte vergeben.';
  end if;

  select id into v_region from public.regions where slug=p_region_slug and is_active;
  if v_region is null then raise exception 'Region nicht gefunden.'; end if;

  select upper(coalesce(role::text,'MEMBER')) into v_role
  from public.profiles where id=p_target and account_status='ACTIVE';
  if v_role is null then raise exception 'Mitglied nicht gefunden oder nicht aktiv.'; end if;
  if v_role not in ('SUPPORTER','ADMIN') then
    raise exception 'Regionale Moderation kann nur Supportern oder Admins zugewiesen werden.';
  end if;

  if p_enabled then
    if not coalesce(p_forum,false) and not coalesce(p_groups,false) then
      raise exception 'Mindestens ein Moderationsbereich muss ausgewählt sein.';
    end if;
    insert into public.regional_moderator_assignments(
      user_id,region_id,forum_moderator,group_moderator,active,granted_by,updated_at
    ) values(
      p_target,v_region,coalesce(p_forum,false),coalesce(p_groups,false),true,auth.uid(),now()
    )
    on conflict(user_id,region_id) do update set
      forum_moderator=excluded.forum_moderator,
      group_moderator=excluded.group_moderator,
      active=true,
      granted_by=excluded.granted_by,
      updated_at=now();
  else
    update public.regional_moderator_assignments
    set active=false,forum_moderator=false,group_moderator=false,granted_by=auth.uid(),updated_at=now()
    where user_id=p_target and region_id=v_region;
  end if;

  perform public.ec_sync_legacy_moderator_flags(p_target);
  perform public.ec_log(
    'REGIONAL_MODERATION_CHANGED', p_target,
    jsonb_build_object('region',p_region_slug,'forum',p_forum,'groups',p_groups,'enabled',p_enabled)
  );
end;
$$;

create or replace function public.ec_is_regional_forum_moderator(
  p_region uuid,
  p_user uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path=public as $$
  select public.ec_is_global_admin_user(p_user) or exists(
    select 1 from public.regional_moderator_assignments a
    where a.user_id=p_user and a.region_id=p_region and a.active and a.forum_moderator
  );
$$;

create or replace function public.ec_is_regional_group_moderator(
  p_region uuid,
  p_user uuid default auth.uid()
)
returns boolean language sql stable security definer set search_path=public as $$
  select public.ec_is_global_admin_user(p_user) or exists(
    select 1 from public.regional_moderator_assignments a
    where a.user_id=p_user and a.region_id=p_region and a.active and a.group_moderator
  );
$$;

revoke all on public.regional_moderator_assignments from public;
grant select on public.regional_moderator_assignments to authenticated;
revoke all on function public.ec_set_regional_moderator(uuid,text,boolean,boolean,boolean) from public;
grant execute on function public.ec_set_regional_moderator(uuid,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.ec_is_regional_forum_moderator(uuid,uuid) to authenticated;
grant execute on function public.ec_is_regional_group_moderator(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
