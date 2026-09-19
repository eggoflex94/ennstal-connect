-- Ennstal Connect: mark AI-assisted public/community content.
-- Admin and Head Admin content is always exempt from the visible AI label.

alter table public.forum_posts
  add column if not exists is_ai_generated boolean not null default false;

alter table public.profile_sections
  add column if not exists is_ai_generated boolean not null default false;

alter table public.community_events
  add column if not exists is_ai_generated boolean not null default false;

alter table public.business_listings
  add column if not exists is_ai_generated boolean not null default false;

create or replace function public.ec_enforce_ai_label_exemption()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_author uuid;
  v_role text;
begin
  v_author := nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
  if v_author is null then return new; end if;

  select role into v_role
  from public.profiles
  where id=v_author;

  if upper(coalesce(v_role,'')) in ('ADMIN','HEAD_ADMIN') then
    new.is_ai_generated := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_forum_posts_ai_exemption on public.forum_posts;
create trigger trg_forum_posts_ai_exemption
before insert or update of is_ai_generated,author_id on public.forum_posts
for each row execute function public.ec_enforce_ai_label_exemption('author_id');

drop trigger if exists trg_profile_sections_ai_exemption on public.profile_sections;
create trigger trg_profile_sections_ai_exemption
before insert or update of is_ai_generated,owner_id on public.profile_sections
for each row execute function public.ec_enforce_ai_label_exemption('owner_id');

drop trigger if exists trg_community_events_ai_exemption on public.community_events;
create trigger trg_community_events_ai_exemption
before insert or update of is_ai_generated,created_by on public.community_events
for each row execute function public.ec_enforce_ai_label_exemption('created_by');

drop trigger if exists trg_business_listings_ai_exemption on public.business_listings;
create trigger trg_business_listings_ai_exemption
before insert or update of is_ai_generated,owner_id on public.business_listings
for each row execute function public.ec_enforce_ai_label_exemption('owner_id');

create or replace function public.ec_clear_ai_labels_for_admin()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if upper(coalesce(new.role,'')) in ('ADMIN','HEAD_ADMIN')
     and upper(coalesce(old.role,'')) not in ('ADMIN','HEAD_ADMIN') then
    update public.forum_posts set is_ai_generated=false where author_id=new.id and is_ai_generated;
    update public.profile_sections set is_ai_generated=false where owner_id=new.id and is_ai_generated;
    update public.community_events set is_ai_generated=false where created_by=new.id and is_ai_generated;
    update public.business_listings set is_ai_generated=false where owner_id=new.id and is_ai_generated;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_ai_labels_for_admin on public.profiles;
create trigger trg_clear_ai_labels_for_admin
after update of role on public.profiles
for each row execute function public.ec_clear_ai_labels_for_admin();

drop function if exists public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid);

create function public.ec_forum_create_regional_post(
  p_scope text,
  p_title text,
  p_content text,
  p_font_family text,
  p_font_size text,
  p_emphasis text,
  p_region uuid,
  p_is_ai_generated boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_post_id uuid;
  v_target_region uuid;
  v_role text;
  v_ai boolean := coalesce(p_is_ai_generated,false);
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if p_scope not in ('COMMUNITY', 'ADMIN') or char_length(trim(p_title)) < 3 or char_length(trim(p_content)) < 3 then
    raise exception 'Ungültiger Forumsbeitrag.';
  end if;
  if p_scope = 'ADMIN' and not public.ec_has_admin_central_access(auth.uid()) then
    raise exception 'Keine Admin-Berechtigung.';
  end if;
  if p_scope = 'COMMUNITY' and exists(
    select 1
    from public.user_feature_locks
    where user_id=auth.uid()
      and feature_key='FORUM_POSTING'
      and is_locked
  ) then
    raise exception 'Deine Forumsfunktion ist gesperrt.';
  end if;

  select role into v_role
  from public.profiles
  where id=auth.uid();

  if upper(coalesce(v_role,'')) in ('ADMIN','HEAD_ADMIN') then
    v_ai := false;
  end if;

  if p_scope='ADMIN' then
    select id into v_target_region
    from public.regions
    where slug='ueberregional' and is_active
    limit 1;
    if v_target_region is null then
      raise exception 'Überregionale Region fehlt.';
    end if;
  else
    if not exists(select 1 from public.regions where id=p_region and is_active) then
      raise exception 'Region nicht gefunden.';
    end if;
    v_target_region := p_region;
  end if;

  insert into public.forum_posts(
    scope,author_id,title,content,font_family,font_size,emphasis,region_id,is_ai_generated
  )
  values(
    p_scope,auth.uid(),trim(p_title),trim(p_content),
    p_font_family,p_font_size,p_emphasis,v_target_region,v_ai
  )
  returning id into v_post_id;

  perform public.ec_write_forum_audit_log(
    'FORUM_POST_CREATED',
    'forum_post',
    v_post_id,
    'Forumsbeitrag erstellt',
    jsonb_build_object(
      'scope',p_scope,
      'title',trim(p_title),
      'region_id',v_target_region,
      'is_ai_generated',v_ai
    )
  );
end;
$function$;

revoke all on function public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid,boolean) from public;
revoke all on function public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid,boolean) from anon;
grant execute on function public.ec_forum_create_regional_post(text,text,text,text,text,text,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
