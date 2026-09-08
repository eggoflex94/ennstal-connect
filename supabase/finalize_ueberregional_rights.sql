-- Finalize the transition from Salzkammergut to Überregional.
-- This migration is idempotent and preserves regional admin/moderator rights.

do $$
declare
  old_id uuid;
  new_id uuid;
begin
  insert into public.regions(slug,name,short_name,description,accent,sort_order,is_active)
  values('ueberregional','Überregional','Überregional','Für Mitglieder aus dem Salzkammergut und allen Orten außerhalb der Ennstal-Connect-Kernregionen.','#5b6b7a',30,true)
  on conflict(slug) do update set
    name=excluded.name,
    short_name=excluded.short_name,
    description=excluded.description,
    accent=excluded.accent,
    sort_order=excluded.sort_order,
    is_active=true;

  select id into old_id from public.regions where slug='salzkammergut' limit 1;
  select id into new_id from public.regions where slug='ueberregional' limit 1;
  if new_id is null then raise exception 'Überregional konnte nicht angelegt werden.'; end if;
  if old_id is null then return; end if;

  -- Members keep their account and are moved to the replacement home region.
  update public.profiles set home_region_id=new_id where home_region_id=old_id;

  -- Preserve regional administrator rights. Merge duplicate assignments safely.
  insert into public.regional_admin_assignments(user_id,region_id,granted_by,active,created_at,updated_at)
  select user_id,new_id,granted_by,active,created_at,now()
  from public.regional_admin_assignments where region_id=old_id
  on conflict(user_id,region_id) do update set
    active=(public.regional_admin_assignments.active or excluded.active),
    granted_by=excluded.granted_by,
    updated_at=now();
  delete from public.regional_admin_assignments where region_id=old_id;

  -- Preserve independently scoped forum/group moderator rights.
  if to_regclass('public.regional_moderator_assignments') is not null then
    insert into public.regional_moderator_assignments(
      user_id,region_id,forum_moderator,group_moderator,active,granted_by,created_at,updated_at
    )
    select user_id,new_id,forum_moderator,group_moderator,active,granted_by,created_at,now()
    from public.regional_moderator_assignments where region_id=old_id
    on conflict(user_id,region_id) do update set
      forum_moderator=(public.regional_moderator_assignments.forum_moderator or excluded.forum_moderator),
      group_moderator=(public.regional_moderator_assignments.group_moderator or excluded.group_moderator),
      active=(public.regional_moderator_assignments.active or excluded.active),
      granted_by=excluded.granted_by,
      updated_at=now();
    delete from public.regional_moderator_assignments where region_id=old_id;
  end if;

  -- Move all known regional content to Überregional.
  if to_regclass('public.homepage_sections') is not null then update public.homepage_sections set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_requests') is not null then update public.community_requests set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.forum_posts') is not null then update public.forum_posts set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_groups') is not null then update public.community_groups set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.news') is not null then update public.news set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_news') is not null then update public.community_news set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_events') is not null then update public.community_events set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.events') is not null then update public.events set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_ads') is not null then update public.community_ads set region_id=new_id where region_id=old_id; end if;
  if to_regclass('public.community_weekly_polls') is not null then update public.community_weekly_polls set region_id=new_id where region_id=old_id; end if;

  -- Salzkammergut stays as a historical record only and can no longer be selected.
  update public.regions set is_active=false where id=old_id;
end $$;

-- Rights are intentionally region-id based, not slug based. Therefore Überregional
-- receives exactly the same admin scope as every other active region.
create or replace function public.ec_can_admin_region(p_region uuid,p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.ec_is_global_admin_user(p_user) or public.ec_is_regional_admin(p_region,p_user);
$$;

-- Regional write policies remain generic and therefore cover Überregional automatically.
do $$
begin
  if to_regclass('public.news') is not null then
    execute 'drop policy if exists news_regional_admin_write on public.news';
    execute 'create policy news_regional_admin_write on public.news for all to authenticated using (public.ec_can_admin_region(region_id,(select auth.uid()))) with check (author_id=(select auth.uid()) and public.ec_can_admin_region(region_id,(select auth.uid())))';
  end if;
  if to_regclass('public.community_events') is not null then
    execute 'drop policy if exists community_events_regional_admin_write on public.community_events';
    execute 'create policy community_events_regional_admin_write on public.community_events for all to authenticated using (public.ec_can_admin_region(region_id,(select auth.uid()))) with check (created_by=(select auth.uid()) and public.ec_can_admin_region(region_id,(select auth.uid())))';
  end if;
end $$;

notify pgrst, 'reload schema';
