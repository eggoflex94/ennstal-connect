-- Primary vs delegated Head Admin model.
-- The existing oldest HEAD_ADMIN becomes the single primary Head Admin.
-- Additional HEAD_ADMIN accounts start with zero delegated permissions.

alter table public.profiles
  add column if not exists is_primary_head_admin boolean not null default false;

update public.profiles
set is_primary_head_admin=true
where id=(
  select id from public.profiles
  where upper(role::text)='HEAD_ADMIN'
  order by created_at nulls last,id
  limit 1
)
and not exists(select 1 from public.profiles where is_primary_head_admin=true);

create unique index if not exists profiles_one_primary_head_admin
  on public.profiles ((is_primary_head_admin))
  where is_primary_head_admin=true;

create or replace function public.ec_is_head_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from public.profiles
    where id=auth.uid()
      and account_status='ACTIVE'
      and upper(role::text)='HEAD_ADMIN'
      and coalesce(is_primary_head_admin,false)=true
  );
$function$;

create or replace function public.ec_is_primary_head_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.ec_is_head_admin();
$function$;

create or replace function public.ec_has_admin_permission(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_allowed boolean:=false;
begin
  if auth.uid() is null then return false; end if;
  if public.ec_is_head_admin() then return true; end if;

  if not exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.account_status='ACTIVE'
      and upper(p.role::text) in ('ADMIN','HEAD_ADMIN')
  ) then return false; end if;

  select case lower(coalesce(p_permission,''))
    when 'manage_members' then coalesce(up.manage_members,false)
    when 'manage_points' then coalesce(up.manage_points,false)
    when 'manage_messages' then coalesce(up.manage_messages,false)
    when 'manage_media' then coalesce(up.manage_media,false)
    when 'manage_roles' then coalesce(up.manage_roles,false)
    when 'manage_admins' then coalesce(up.manage_admins,false)
    when 'view_profile_visits' then coalesce(up.view_profile_visits,false)
    when 'manage_news' then coalesce(up.manage_news,false)
    when 'manage_groups' then coalesce(up.manage_groups,false)
    when 'manage_events' then coalesce(up.manage_events,false)
    when 'manage_marketplace' then coalesce(up.manage_marketplace,false)
    when 'manage_friend_requests' then coalesce(up.manage_friend_requests,false)
    when 'manage_homepage' then coalesce(up.manage_homepage,false)
    when 'manage_reports' then coalesce(up.manage_reports,false)
    when 'manage_community_photographers' then coalesce(up.manage_community_photographers,false)
    when 'view_personal_data' then coalesce(up.view_personal_data,false)
    else false
  end
  into v_allowed
  from public.user_permissions up
  where up.user_id=auth.uid();

  return coalesce(v_allowed,false);
end;
$function$;

create or replace function public.ec_can_view_personal_data()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.ec_is_head_admin()
    or public.ec_has_admin_permission('view_personal_data');
$function$;

create or replace function public.is_head_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.ec_is_head_admin();
$function$;

create or replace function public.is_admin_or_head()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.ec_is_head_admin()
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.account_status='ACTIVE'
        and upper(p.role::text)='ADMIN'
    );
$function$;

create or replace function public.ec_is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.ec_is_head_admin()
    or exists(
      select 1 from public.profiles p
      where p.id=auth.uid()
        and p.account_status='ACTIVE'
        and upper(p.role::text)='ADMIN'
    );
$function$;

create or replace function public.ec_has_admin_central_access(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_user is not null and exists(
    select 1 from public.profiles p
    where p.id=p_user
      and p.account_status='ACTIVE'
      and (
        coalesce(p.is_primary_head_admin,false)
        or upper(p.role::text)='ADMIN'
        or coalesce(p.forum_moderator,false)
        or exists(
          select 1 from public.regional_admin_assignments raa
          where raa.user_id=p_user and raa.active
        )
        or exists(
          select 1 from public.regional_moderation_assignments rma
          where rma.user_id=p_user and rma.active
            and coalesce(array_length(rma.permissions,1),0)>0
        )
        or exists(
          select 1 from public.user_permissions up
          where up.user_id=p_user and (
            coalesce(up.manage_members,false)
            or coalesce(up.manage_points,false)
            or coalesce(up.manage_messages,false)
            or coalesce(up.manage_media,false)
            or coalesce(up.manage_roles,false)
            or coalesce(up.manage_admins,false)
            or coalesce(up.view_profile_visits,false)
            or coalesce(up.manage_news,false)
            or coalesce(up.manage_groups,false)
            or coalesce(up.manage_events,false)
            or coalesce(up.manage_marketplace,false)
            or coalesce(up.manage_friend_requests,false)
            or coalesce(up.manage_homepage,false)
            or coalesce(up.manage_reports,false)
            or coalesce(up.manage_community_photographers,false)
            or coalesce(up.view_personal_data,false)
          )
        )
      )
  );
$function$;

create or replace function public.my_admin_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then return '{}'::jsonb; end if;

  if public.ec_is_head_admin() then
    return jsonb_build_object(
      'primary_head_admin',true,
      'manage_members',true,
      'manage_points',true,
      'manage_messages',true,
      'manage_media',true,
      'manage_roles',true,
      'manage_admins',true,
      'view_profile_visits',true,
      'manage_news',true,
      'manage_groups',true,
      'manage_events',true,
      'manage_marketplace',true,
      'manage_friend_requests',true,
      'manage_homepage',true,
      'manage_reports',true,
      'manage_community_photographers',true,
      'view_personal_data',true
    );
  end if;

  select to_jsonb(up)-'user_id'-'updated_at'
  into v_result
  from public.user_permissions up
  where up.user_id=auth.uid();

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('primary_head_admin',false);
end;
$function$;

revoke all on function public.my_admin_permissions() from public,anon;
grant execute on function public.my_admin_permissions() to authenticated;

create or replace function public.admin_set_role(target_user uuid,new_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_role text;
  v_action text;
  v_role_label text;
  v_primary boolean:=public.ec_is_head_admin();
  v_can_manage_roles boolean:=public.ec_has_admin_permission('manage_roles');
begin
  if not (v_primary or v_can_manage_roles) then
    raise exception 'Keine Freigabe für Rollenverwaltung.';
  end if;
  if target_user is null or target_user=auth.uid() then
    raise exception 'Die eigene Rolle kann nicht verändert werden.';
  end if;

  new_role:=upper(btrim(coalesce(new_role,'')));
  if new_role not in ('MEMBER','SUPPORTER','ADMIN','MUNICIPALITY','HEAD_ADMIN') then
    raise exception 'Ungültige Rolle.';
  end if;
  if new_role='HEAD_ADMIN' and not v_primary then
    raise exception 'Nur der primäre Head Admin darf weitere Head Admins ernennen.';
  end if;

  select role::text into v_old_role
  from public.profiles
  where id=target_user
  for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;

  if exists(
    select 1 from public.profiles
    where id=target_user and coalesce(is_primary_head_admin,false)=true
  ) then raise exception 'Der primäre Head Admin ist geschützt.'; end if;

  if v_old_role='HEAD_ADMIN' and not v_primary then
    raise exception 'Delegierte Head Admins können nur vom primären Head Admin verändert werden.';
  end if;
  if v_old_role=new_role then return; end if;

  delete from public.admin_permissions where admin_id=target_user;
  delete from public.user_permissions where user_id=target_user;
  insert into public.user_permissions(user_id) values(target_user)
  on conflict(user_id) do nothing;

  update public.profiles
  set role=new_role::public.user_role,
      is_primary_head_admin=false,
      forum_moderator=false,
      admin_responsibilities='{}'::text[]
  where id=target_user;

  if new_role<>'MEMBER' then
    v_role_label:=case new_role
      when 'SUPPORTER' then 'die Rolle Supporter'
      when 'ADMIN' then 'die Rolle Global Admin'
      when 'HEAD_ADMIN' then 'die Rolle Head Admin'
      when 'MUNICIPALITY' then 'die Rolle Gemeinde'
      else 'die Rolle '||new_role
    end;
    perform public.ec_send_assignment_message(
      target_user,
      v_role_label,
      case new_role
        when 'HEAD_ADMIN' then 'Du wurdest zum Head Admin ernannt. Alle Verwaltungsrechte sind zunächst deaktiviert und müssen vom primären Head Admin einzeln in der Admin-Zentrale freigegeben werden.'
        when 'ADMIN' then 'Deine einzelnen Admin-Berechtigungen werden separat durch den primären Head Admin festgelegt.'
        when 'SUPPORTER' then 'Dein Supporter-Rollenstern ist jetzt in deinem Profil sichtbar.'
        when 'MUNICIPALITY' then 'Dein Gemeindekonto ist mit einem grünen Stern und Rahmen gekennzeichnet.'
        else null
      end
    );
  end if;

  v_action:=case
    when new_role='MEMBER' and v_old_role<>'MEMBER' then 'ROLLE_ENTFERNT'
    when v_old_role='MEMBER' and new_role<>'MEMBER' then 'ROLLE_ERTEILT'
    else 'ROLLE_GEAENDERT'
  end;

  perform public.ec_audit_insert(
    v_action,'profil',target_user,target_user,null,
    jsonb_build_object('alte_rolle',v_old_role,'neue_rolle',new_role,'delegierter_head_admin',new_role='HEAD_ADMIN')
  );
end;
$function$;

create or replace function public.admin_get_permissions(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der primäre Head Admin darf Rechte einsehen.';
  end if;
  if exists(
    select 1 from public.profiles
    where id=target_user and coalesce(is_primary_head_admin,false)=true
  ) then
    raise exception 'Die Rechte des primären Head Admins sind immer vollständig aktiv.';
  end if;

  select to_jsonb(p)-'user_id'-'updated_at'
  into v_result
  from public.user_permissions p
  where p.user_id=target_user;

  return coalesce(v_result,'{}'::jsonb);
end;
$function$;

drop function if exists public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
);

create function public.admin_set_permissions(
  target_user uuid,
  p_manage_members boolean default false,
  p_manage_points boolean default false,
  p_manage_messages boolean default false,
  p_manage_media boolean default false,
  p_manage_roles boolean default false,
  p_manage_admins boolean default false,
  p_view_profile_visits boolean default false,
  p_manage_news boolean default false,
  p_manage_groups boolean default false,
  p_manage_events boolean default false,
  p_manage_marketplace boolean default false,
  p_manage_friend_requests boolean default false,
  p_manage_homepage boolean default false,
  p_manage_reports boolean default false,
  p_manage_community_photographers boolean default false,
  p_view_personal_data boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der primäre Head Admin darf Berechtigungen ändern.';
  end if;
  if exists(
    select 1 from public.profiles
    where id=target_user and coalesce(is_primary_head_admin,false)=true
  ) then
    raise exception 'Die Rechte des primären Head Admins sind immer vollständig aktiv.';
  end if;

  insert into public.user_permissions(
    user_id,manage_members,manage_points,manage_messages,manage_media,manage_roles,
    manage_admins,view_profile_visits,manage_news,manage_groups,manage_events,
    manage_marketplace,manage_friend_requests,manage_homepage,manage_reports,
    manage_community_photographers,view_personal_data,updated_at
  )
  values(
    target_user,p_manage_members,p_manage_points,p_manage_messages,p_manage_media,p_manage_roles,
    p_manage_admins,p_view_profile_visits,p_manage_news,p_manage_groups,p_manage_events,
    p_manage_marketplace,p_manage_friend_requests,p_manage_homepage,p_manage_reports,
    p_manage_community_photographers,p_view_personal_data,now()
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
    manage_reports=excluded.manage_reports,
    manage_community_photographers=excluded.manage_community_photographers,
    view_personal_data=excluded.view_personal_data,
    updated_at=now();
end;
$function$;

create or replace function public.can_manage_community_photographers()
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
  select public.ec_is_head_admin()
    or public.ec_has_admin_permission('manage_community_photographers');
$function$;

create or replace function public.ec_can_profile_admin_action(
  p_target_user uuid,
  p_permission text default null,
  p_regional_permission text default null,
  p_allow_forum_moderator boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  if auth.uid() is null or p_target_user is null or p_target_user=auth.uid() then return false; end if;
  select * into v_actor from public.profiles where id=auth.uid() and account_status='ACTIVE';
  select * into v_target from public.profiles where id=p_target_user;
  if v_actor.id is null or v_target.id is null then return false; end if;

  if coalesce(v_target.is_primary_head_admin,false) then return false; end if;
  if public.ec_is_head_admin() then return true; end if;
  if upper(v_target.role::text)='HEAD_ADMIN' then return false; end if;
  if upper(v_target.role::text)='ADMIN' then return false; end if;
  if exists(select 1 from public.regional_admin_assignments where user_id=p_target_user and active=true) then return false; end if;

  if p_permission is not null and public.ec_has_admin_permission(p_permission) then return true; end if;

  if p_regional_permission is not null and v_target.home_region_id is not null and exists(
    select 1 from public.regional_moderation_assignments rm
    where rm.user_id=auth.uid()
      and rm.region_id=v_target.home_region_id
      and rm.active=true
      and exists(
        select 1 from unnest(coalesce(rm.permissions,'{}'::text[])) perm
        where upper(perm)=upper(p_regional_permission)
      )
  ) then return true; end if;

  if p_allow_forum_moderator and coalesce(v_actor.forum_moderator,false) then return true; end if;
  return false;
end;
$function$;

drop function if exists public.admin_full_member_directory();

create function public.admin_full_member_directory()
returns table(
  id uuid,nickname text,role text,account_status text,is_test_account boolean,
  avatar_url text,account_badge text,rules_version text,rules_accepted_at timestamptz,
  is_primary_head_admin boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.ec_has_admin_central_access() then
    raise exception 'Keine Freigabe für die Admin-Zentrale.';
  end if;
  return query
  select p.id,p.nickname,p.role::text,p.account_status,coalesce(p.is_test_account,false),
         p.avatar_url,p.account_badge,a.rules_version,a.accepted_at,
         coalesce(p.is_primary_head_admin,false)
  from public.profiles p
  left join lateral(
    select x.rules_version,x.accepted_at
    from public.community_rule_acceptances x
    where x.user_id=p.id
    order by x.accepted_at desc
    limit 1
  ) a on true
  order by case
    when coalesce(p.is_primary_head_admin,false) then 0
    when p.role='HEAD_ADMIN' then 1
    when p.role='ADMIN' then 2
    when p.role='SUPPORTER' then 3
    else 4 end,
    lower(p.nickname);
end;
$function$;

create or replace function public.admin_update_member(
  p_user_id uuid,p_nickname text,p_first_name text,p_last_name text,
  p_birth_date date,p_gender text,p_role text,p_account_status text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not(public.ec_is_head_admin() or public.ec_has_admin_permission('manage_members')) then
    raise exception 'Keine Freigabe für Mitgliederverwaltung.';
  end if;
  if p_user_id is null then raise exception 'Mitglied nicht gefunden.'; end if;
  if exists(
    select 1 from public.profiles
    where id=p_user_id and coalesce(is_primary_head_admin,false)=true
  ) and not public.ec_is_head_admin() then
    raise exception 'Der primäre Head Admin ist geschützt.';
  end if;

  update public.profiles
  set nickname=nullif(trim(p_nickname),''),
      first_name=nullif(trim(p_first_name),''),
      last_name=nullif(trim(p_last_name),''),
      birth_date=p_birth_date,
      gender=nullif(trim(p_gender),'')
  where id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end;
$function$;

create or replace function public.head_admin_adjust_own_points(p_delta integer,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_reason text:=btrim(coalesce(p_reason,''));
  v_balance integer;
  v_score integer;
  v_kind public.point_kind;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.'; end if;
  if p_delta is null or p_delta=0 then raise exception 'Punkteänderung darf nicht 0 sein.'; end if;
  if char_length(v_reason)>500 then raise exception 'Begründung ist zu lang.'; end if;

  if not(
    public.ec_is_head_admin()
    or (
      public.ec_has_admin_permission('manage_points')
      and exists(
        select 1 from public.profiles
        where id=v_uid and account_status='ACTIVE' and upper(role::text)='HEAD_ADMIN'
      )
    )
  ) then raise exception 'Keine Freigabe für eigene Head-Admin-Punkte.'; end if;

  update public.profiles
  set points=coalesce(points,0)+p_delta,updated_at=now()
  where id=v_uid
  returning points into v_balance;

  v_kind:=case when p_delta>0 then 'PLUS'::public.point_kind else 'MINUS'::public.point_kind end;
  insert into public.point_transactions(member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated)
  values(v_uid,v_uid,v_kind,p_delta,v_reason,'HEAD_ADMIN_SELF','HEAD_ADMIN_SELF',null,false);
  insert into public.point_history(user_id,amount,delta,reason,changed_by)
  values(v_uid,p_delta,p_delta,v_reason,v_uid);

  select coalesce((private.ec_activity_score(v_uid)->>'score')::integer,0) into v_score;

  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(v_uid,
    case when p_delta>0 then 'HEAD_ADMIN_SELF_POINTS_AWARDED' else 'HEAD_ADMIN_SELF_POINTS_DEDUCTED' end,
    'PROFILE',v_uid,
    jsonb_build_object('delta',p_delta,'reason',v_reason,'manual_balance',v_balance,'total_score',v_score)
  );

  return jsonb_build_object('member_id',v_uid,'delta',p_delta,'manual_balance',v_balance,'score',v_score);
end;
$function$;
