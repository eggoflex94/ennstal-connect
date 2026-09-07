-- Complete region isolation for Ennstal Connect.
-- Existing unscoped content belongs to Ennstal; all new content receives an explicit region.

do $$
declare ennstal_id uuid;
begin
  select id into ennstal_id from public.regions where slug = 'ennstal';

  alter table public.homepage_sections add column if not exists region_id uuid references public.regions(id);
  alter table public.community_requests add column if not exists region_id uuid references public.regions(id);

  update public.homepage_sections set region_id = ennstal_id where region_id is null;
  update public.community_requests set region_id = ennstal_id where region_id is null;

  create index if not exists homepage_sections_region_idx on public.homepage_sections(region_id);
  create index if not exists community_requests_region_idx on public.community_requests(region_id);
end $$;

create or replace function public.ec_region_group_directory(p_region uuid)
returns table(
  id uuid, name text, description text, image_url text, created_by uuid,
  owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint,
  region_id uuid, is_featured boolean
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.description, g.image_url, g.created_by, g.owner_id, g.created_at,
    coalesce(array_agg(gm.user_id) filter (
      where p.id is not null and p.account_status = 'ACTIVE' and not coalesce(p.is_test_account, false)
    ), '{}'::uuid[]) as member_ids,
    count(gm.user_id) filter (
      where p.id is not null and p.account_status = 'ACTIVE' and not coalesce(p.is_test_account, false)
    ) as member_count,
    g.region_id, g.is_featured
  from public.community_groups g
  left join public.community_group_members gm on gm.group_id = g.id
  left join public.profiles p on p.id = gm.user_id
  where g.region_id = p_region
  group by g.id
  order by g.created_at desc;
$$;

create or replace function public.ec_create_regional_community_group(
  p_name text, p_description text, p_image_url text, p_region uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_group_id uuid;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles where id = auth.uid() and account_status = 'ACTIVE'
  ) then raise exception 'Nur aktive Mitglieder können Gruppen erstellen.'; end if;
  if not exists(select 1 from public.regions where id = p_region and is_active) then
    raise exception 'Region nicht gefunden.';
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 or char_length(trim(coalesce(p_description, ''))) < 10 then
    raise exception 'Gruppenname oder Beschreibung ist zu kurz.';
  end if;
  insert into public.community_groups(name, description, image_url, created_by, owner_id, region_id)
  values(trim(p_name), trim(p_description), nullif(trim(coalesce(p_image_url, '')), ''), auth.uid(), auth.uid(), p_region)
  returning id into v_group_id;
  insert into public.community_group_members(group_id, user_id) values(v_group_id, auth.uid());
  return v_group_id;
end;
$$;

create or replace function public.ec_region_weekly_poll_current(p_region uuid)
returns table(id uuid, question text, options text[], vote_counts integer[], my_vote integer, region_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.question, p.options,
    array(
      select count(*)::integer
      from unnest(p.options) with ordinality o(option_text, position)
      left join public.community_weekly_poll_votes v on v.poll_id = p.id and v.option_index = o.position - 1
      group by o.position order by o.position
    ),
    (select v.option_index from public.community_weekly_poll_votes v where v.poll_id = p.id and v.user_id = auth.uid()),
    p.region_id
  from public.community_weekly_polls p
  where p.region_id = p_region and p.is_active
  order by p.created_at desc limit 1;
$$;

create or replace function public.ec_create_regional_weekly_poll(p_question text, p_options text[], p_region uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Wochenfragen veröffentlichen.'; end if;
  if not exists(select 1 from public.regions where id = p_region and is_active) then raise exception 'Region nicht gefunden.'; end if;
  if char_length(trim(coalesce(p_question, ''))) < 5 or cardinality(p_options) not between 2 and 6
     or exists(select 1 from unnest(p_options) x where char_length(trim(coalesce(x, ''))) < 1)
  then raise exception 'Bitte Frage und zwei bis sechs Antwortmöglichkeiten angeben.'; end if;
  update public.community_weekly_polls set is_active = false where region_id = p_region and is_active;
  insert into public.community_weekly_polls(question, options, created_by, region_id)
  values(trim(p_question), array(select trim(x) from unnest(p_options) x), auth.uid(), p_region)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ec_region_featured_community_group(p_region uuid)
returns table(
  id uuid, name text, description text, image_url text, created_by uuid,
  owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint,
  region_id uuid, is_featured boolean
)
language sql stable security definer set search_path = public as $$
  select * from public.ec_region_group_directory(p_region) where is_featured limit 1;
$$;

create or replace function public.ec_set_regional_featured_group(p_group_id uuid, p_region uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf die Gruppe der Woche festlegen.'; end if;
  if p_group_id is not null and not exists(
    select 1 from public.community_groups where id = p_group_id and region_id = p_region
  ) then raise exception 'Gruppe wurde in dieser Region nicht gefunden.'; end if;
  update public.community_groups set is_featured = false where region_id = p_region and is_featured;
  if p_group_id is not null then
    update public.community_groups set is_featured = true where id = p_group_id and region_id = p_region;
  end if;
end;
$$;

create or replace function public.ec_admin_create_regional_ad(
  p_title text, p_body text, p_link_url text, p_image_url text, p_region uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Werbeflächen veröffentlichen.'; end if;
  if not exists(select 1 from public.regions where id = p_region and is_active) then raise exception 'Region nicht gefunden.'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Der Name muss mindestens drei Zeichen haben.'; end if;
  insert into public.community_ads(title, body, link_url, image_url, created_by, region_id)
  values(trim(p_title), trim(coalesce(p_body, '')), nullif(trim(coalesce(p_link_url, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''), auth.uid(), p_region)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.ec_forum_create_regional_post(
  p_scope text, p_title text, p_content text, p_font_family text,
  p_font_size text, p_emphasis text, p_region uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare v_post_id uuid;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists(select 1 from public.regions where id = p_region and is_active) then raise exception 'Region nicht gefunden.'; end if;
  if p_scope not in ('COMMUNITY', 'ADMIN') or char_length(trim(p_title)) < 3 or char_length(trim(p_content)) < 3 then
    raise exception 'Ungültiger Forumsbeitrag.';
  end if;
  if p_scope = 'ADMIN' and not public.ec_is_global_admin_user(auth.uid()) then raise exception 'Keine Admin-Berechtigung.'; end if;
  if p_scope = 'COMMUNITY' and exists(
    select 1 from public.user_feature_locks where user_id = auth.uid() and feature_key = 'FORUM_POSTING' and is_locked
  ) then raise exception 'Deine Forumsfunktion ist gesperrt.'; end if;
  insert into public.forum_posts(scope, author_id, title, content, font_family, font_size, emphasis, region_id)
  values(p_scope, auth.uid(), trim(p_title), trim(p_content), p_font_family, p_font_size, p_emphasis, p_region)
  returning id into v_post_id;
  perform public.ec_write_forum_audit_log('FORUM_POST_CREATED', 'forum_post', v_post_id,
    'Forumsbeitrag erstellt', jsonb_build_object('scope', p_scope, 'title', trim(p_title), 'region_id', p_region));
end;
$$;

-- Regional administrators can maintain news and events only in their assigned region.
drop policy if exists news_regional_admin_write on public.news;
create policy news_regional_admin_write on public.news for all to authenticated
using (public.ec_can_admin_region(region_id, (select auth.uid())))
with check (author_id = (select auth.uid()) and public.ec_can_admin_region(region_id, (select auth.uid())));

drop policy if exists community_events_regional_admin_write on public.community_events;
create policy community_events_regional_admin_write on public.community_events for all to authenticated
using (public.ec_can_admin_region(region_id, (select auth.uid())))
with check (created_by = (select auth.uid()) and public.ec_can_admin_region(region_id, (select auth.uid())));

revoke all on function public.ec_region_group_directory(uuid) from public;
revoke all on function public.ec_create_regional_community_group(text,text,text,uuid) from public;
revoke all on function public.ec_region_weekly_poll_current(uuid) from public;
revoke all on function public.ec_create_regional_weekly_poll(text,text[],uuid) from public;
revoke all on function public.ec_region_featured_community_group(uuid) from public;
revoke all on function public.ec_set_regional_featured_group(uuid,uuid) from public;
revoke all on function public.ec_admin_create_regional_ad(text,text,text,text,uuid) from public;
revoke all on function public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid) from public;

grant execute on function public.ec_region_group_directory(uuid) to authenticated;
grant execute on function public.ec_create_regional_community_group(text,text,text,uuid) to authenticated;
grant execute on function public.ec_region_weekly_poll_current(uuid) to authenticated;
grant execute on function public.ec_create_regional_weekly_poll(text,text[],uuid) to authenticated;
grant execute on function public.ec_region_featured_community_group(uuid) to authenticated;
grant execute on function public.ec_set_regional_featured_group(uuid,uuid) to authenticated;
grant execute on function public.ec_admin_create_regional_ad(text,text,text,text,uuid) to authenticated;
grant execute on function public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid) to authenticated;

notify pgrst, 'reload schema';
