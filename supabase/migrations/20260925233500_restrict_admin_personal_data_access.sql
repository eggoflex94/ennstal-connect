alter table public.user_permissions
  add column if not exists view_personal_data boolean not null default false;

create or replace function public.ec_can_view_personal_data()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    exists(
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.account_status = 'ACTIVE'
        and upper(p.role::text) = 'HEAD_ADMIN'
    )
    or exists(
      select 1
      from public.user_permissions up
      join public.profiles p on p.id = up.user_id
      where up.user_id = auth.uid()
        and coalesce(up.view_personal_data,false) = true
        and p.account_status = 'ACTIVE'
        and (
          upper(p.role::text) = 'ADMIN'
          or exists(
            select 1
            from public.regional_admin_assignments raa
            where raa.user_id = p.id
              and raa.active = true
          )
        )
    );
$function$;

revoke all on function public.ec_can_view_personal_data() from public, anon;
grant execute on function public.ec_can_view_personal_data() to authenticated;

create or replace function public.admin_member_directory()
returns table(id uuid, email text)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
begin
  if not public.ec_can_view_personal_data() then
    raise exception 'Keine Freigabe für persönliche Daten.';
  end if;
  return query
  select u.id, u.email::text
  from auth.users u
  order by u.email;
end;
$function$;

create or replace function public.admin_account_review_queue()
returns table(user_id uuid, email text, nickname text, registered_at timestamptz, review_reason text)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
begin
  if not public.ec_can_view_personal_data() then
    raise exception 'Keine Freigabe für persönliche Daten.';
  end if;

  return query
  select
    p.id,
    u.email::text,
    coalesce(nullif(p.nickname, ''), 'Ohne Nickname'),
    u.created_at,
    'E-Mail-Adresse noch nicht bestätigt'
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email_confirmed_at is null
  order by u.created_at desc;
end;
$function$;

create or replace function public.admin_registration_approval_queue()
returns table(user_id uuid, nickname text, email text, registered_at timestamptz, review_reason text)
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
begin
  if not public.ec_can_view_personal_data() then
    raise exception 'Keine Freigabe für persönliche Daten.';
  end if;

  return query
  select
    r.user_id,
    coalesce(nullif(p.nickname,''),'Mitglied'),
    u.email::text,
    r.created_at,
    'Registrierung wartet auf Freigabe'
  from public.registration_approval_requests r
  join public.profiles p on p.id=r.user_id
  join auth.users u on u.id=r.user_id
  where r.status='PENDING'
  order by r.created_at;
end;
$function$;

create or replace function public.admin_queue_existing_registration(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public','auth'
as $function$
declare
  v_user_id uuid;
begin
  if not public.ec_can_view_personal_data() then
    raise exception 'Keine Freigabe für persönliche Daten.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email)=lower(trim(p_email));

  if v_user_id is null then raise exception 'Kein Konto mit dieser E-Mail gefunden.'; end if;
  if exists(select 1 from public.profiles where id=v_user_id and role='HEAD_ADMIN') then
    raise exception 'Der Head Admin kann nicht in die Freigabe verschoben werden.';
  end if;

  update public.profiles
  set account_status='PENDING_APPROVAL'
  where id=v_user_id;

  insert into public.registration_approval_requests(user_id)
  values(v_user_id)
  on conflict(user_id) do update
  set status='PENDING', reviewed_at=null, reviewed_by=null, reason=null;
end;
$function$;

drop function if exists public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean
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
  p_view_personal_data boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old public.user_permissions%rowtype;
  v_granted text[] := '{}'::text[];
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Head Admin darf Berechtigungen ändern.';
  end if;

  if exists(
    select 1 from public.profiles
    where id=target_user and upper(role::text)='HEAD_ADMIN'
  ) then
    raise exception 'Die Rechte des Head Admins werden nicht eingeschränkt.';
  end if;

  select * into v_old
  from public.user_permissions
  where user_id=target_user;

  if coalesce(p_manage_members,false) and not coalesce(v_old.manage_members,false) then v_granted := array_append(v_granted,'Mitgliederrechte'); end if;
  if coalesce(p_manage_points,false) and not coalesce(v_old.manage_points,false) then v_granted := array_append(v_granted,'Punkterechte'); end if;
  if coalesce(p_manage_messages,false) and not coalesce(v_old.manage_messages,false) then v_granted := array_append(v_granted,'Nachrichtenrechte'); end if;
  if coalesce(p_manage_media,false) and not coalesce(v_old.manage_media,false) then v_granted := array_append(v_granted,'Medienrechte'); end if;
  if coalesce(p_manage_roles,false) and not coalesce(v_old.manage_roles,false) then v_granted := array_append(v_granted,'Rollenrechte'); end if;
  if coalesce(p_manage_admins,false) and not coalesce(v_old.manage_admins,false) then v_granted := array_append(v_granted,'Admin-Verwaltungsrechte'); end if;
  if coalesce(p_view_profile_visits,false) and not coalesce(v_old.view_profile_visits,false) then v_granted := array_append(v_granted,'Rechte für Profilbesuche'); end if;
  if coalesce(p_manage_news,false) and not coalesce(v_old.manage_news,false) then v_granted := array_append(v_granted,'Neuigkeiten-Rechte'); end if;
  if coalesce(p_manage_groups,false) and not coalesce(v_old.manage_groups,false) then v_granted := array_append(v_granted,'Gruppenrechte'); end if;
  if coalesce(p_manage_events,false) and not coalesce(v_old.manage_events,false) then v_granted := array_append(v_granted,'Event-Rechte'); end if;
  if coalesce(p_manage_marketplace,false) and not coalesce(v_old.manage_marketplace,false) then v_granted := array_append(v_granted,'Marktplatz-Rechte'); end if;
  if coalesce(p_manage_friend_requests,false) and not coalesce(v_old.manage_friend_requests,false) then v_granted := array_append(v_granted,'Freundschaftsanfragen-Rechte'); end if;
  if coalesce(p_manage_homepage,false) and not coalesce(v_old.manage_homepage,false) then v_granted := array_append(v_granted,'Startseiten-Rechte'); end if;
  if coalesce(p_manage_reports,false) and not coalesce(v_old.manage_reports,false) then v_granted := array_append(v_granted,'Moderations- und Melderechte'); end if;
  if coalesce(p_view_personal_data,false) and not coalesce(v_old.view_personal_data,false) then v_granted := array_append(v_granted,'Persönliche Daten einsehen'); end if;

  insert into public.user_permissions(
    user_id,manage_members,manage_points,manage_messages,manage_media,manage_roles,
    manage_admins,view_profile_visits,manage_news,manage_groups,manage_events,
    manage_marketplace,manage_friend_requests,manage_homepage,manage_reports,
    view_personal_data,updated_at
  )
  values(
    target_user,p_manage_members,p_manage_points,p_manage_messages,p_manage_media,p_manage_roles,
    p_manage_admins,p_view_profile_visits,p_manage_news,p_manage_groups,p_manage_events,
    p_manage_marketplace,p_manage_friend_requests,p_manage_homepage,p_manage_reports,
    p_view_personal_data,now()
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
    view_personal_data=excluded.view_personal_data,
    updated_at=now();

  if coalesce(array_length(v_granted,1),0) > 0 then
    perform public.ec_send_assignment_message(
      target_user,
      case when array_length(v_granted,1)=1
        then 'das Recht ' || v_granted[1]
        else 'die Rechte ' || array_to_string(v_granted, ', ')
      end,
      'Die neuen Berechtigungen sind ab sofort für dein Konto aktiv.'
    );
  end if;
end;
$function$;

revoke all on function public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) from public, anon;
grant execute on function public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;
