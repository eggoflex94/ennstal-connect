create or replace function public.award_member_points(
  target_user uuid,
  point_delta integer,
  reason_text text,
  category_text text default 'ADMIN_ADJUSTMENT'::text,
  notify_member boolean default true,
  source_type_text text default null::text,
  source_id_value uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_nickname text;
  v_actor_label text;
  v_target_region uuid;
  v_balance integer;
  v_total_score integer;
  v_kind public.point_kind;
  v_message_id uuid;
  v_reason text := btrim(coalesce(reason_text,''));
  v_category text := upper(btrim(coalesce(category_text,'ADMIN_ADJUSTMENT')));
  v_is_head_admin boolean := false;
begin
  if v_actor is null then raise exception 'Nicht angemeldet'; end if;
  if target_user is null then raise exception 'Kein Mitglied ausgewählt'; end if;
  if point_delta is null or point_delta = 0 then raise exception 'Punkteänderung darf nicht 0 sein'; end if;

  select role::text,coalesce(nullif(nickname,''),'Admin')
    into v_actor_role,v_actor_nickname
  from public.profiles
  where id=v_actor and account_status='ACTIVE';
  if not found then raise exception 'Aktives Adminprofil nicht gefunden'; end if;

  v_is_head_admin := upper(coalesce(v_actor_role,''))='HEAD_ADMIN';

  if not v_is_head_admin and abs(point_delta) > 100 then
    raise exception 'Pro Vorgang sind maximal 100 Punkte erlaubt';
  end if;
  if not v_is_head_admin and length(v_reason) < 10 then
    raise exception 'Bitte eine Begründung mit mindestens 10 Zeichen angeben';
  end if;
  if length(v_reason) > 500 then raise exception 'Begründung ist zu lang'; end if;

  select home_region_id into v_target_region from public.profiles where id=target_user;
  if not found then raise exception 'Mitglied nicht gefunden'; end if;

  if exists(select 1 from public.profiles where id=target_user and upper(role::text)='HEAD_ADMIN') then
    raise exception 'Der Head Admin kann über Admin-Werkzeuge keine Punkteänderung erhalten.';
  end if;

  if not public.ec_can_profile_admin_action(target_user,'manage_points',null,false) then
    raise exception 'Punkteänderungen sind nur dem Hauptadmin oder ausdrücklich mit Punkterecht freigegebenen Admins erlaubt.';
  end if;

  v_actor_label := case
    when v_is_head_admin then 'Hauptadmin'
    when upper(v_actor_role)='ADMIN' then 'Community Admin'
    else 'Admin'
  end;

  update public.profiles
  set points=coalesce(points,0)+point_delta,updated_at=now()
  where id=target_user
  returning points into v_balance;

  v_kind := case when point_delta>0 then 'PLUS'::public.point_kind else 'MINUS'::public.point_kind end;

  insert into public.point_transactions(member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated)
  values(target_user,v_actor,v_kind,point_delta,v_reason,v_category,source_type_text,source_id_value,false);

  insert into public.point_history(user_id,amount,delta,reason,changed_by)
  values(target_user,point_delta,point_delta,v_reason,v_actor);

  if notify_member then
    insert into public.messages(sender_id,receiver_id,content,is_read,message_type,points_delta)
    values(
      v_actor,target_user,
      'Du hast soeben von '||v_actor_nickname||' '||
      case when point_delta>0 then '+'||point_delta else point_delta::text end||
      ' Punkte erhalten.'||
      case when v_reason<>'' then E'\nGrund: '||v_reason else '' end||
      E'\n\nDies ist eine automatisch generierte Nachricht.',
      false,'POINTS',point_delta
    )
    returning id into v_message_id;
  end if;

  select coalesce((private.ec_activity_score(target_user)->>'score')::integer,0) into v_total_score;

  if v_total_score <= -10 and not public.ec_is_protected_admin_target(target_user) then
    update public.profiles
    set account_status='SUSPENDED',is_online=false,suspended_at=coalesce(suspended_at,now()),
        suspended_by=coalesce(suspended_by,v_actor),
        suspension_reason='Automatische Sperre wegen Punktestand '||v_total_score||'.'||
          case when v_reason<>'' then ' Letzte Begründung: '||v_reason else '' end
    where id=target_user;

    insert into public.admin_logs(actor_id,action,target_type,target_id,details)
    values(v_actor,'AUTO_SUSPEND_POINTS','PROFILE',target_user,
      jsonb_build_object('score',v_total_score,'threshold',-10,'reason','Automatische Sperre ab -10 Punkten','last_point_reason',v_reason,'awarded_by_nickname',v_actor_nickname,'awarded_by_role',v_actor_label));

    if not v_is_head_admin then
      perform public.ec_private_head_admin_alert(
        'Admin-Kontrolle: Profil automatisch gesperrt',
        v_actor_nickname||' hat eine Punkteänderung ausgelöst, durch die das Profil automatisch gesperrt wurde.'||
          case when v_reason<>'' then E'\nGrund: '||v_reason else '' end,
        'HEAD_ADMIN_CONTROL'
      );
      insert into public.messages(sender_id,receiver_id,content,is_read,created_at,message_type)
      select v_actor,p.id,
        'Automatische Admin-Kontrolle:'||E'\n'||v_actor_nickname||
        ' hat eine Punkteänderung ausgelöst, durch die ein Profil automatisch gesperrt wurde.'||
        case when v_reason<>'' then E'\nGrund: '||v_reason else '' end,
        false,now(),'HEAD_ADMIN_CONTROL'
      from public.profiles p
      where upper(p.role::text)='HEAD_ADMIN' and p.account_status='ACTIVE' and p.id<>v_actor;
    end if;
  end if;

  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(v_actor,
    case when point_delta>0 then 'POINTS_AWARDED' else 'POINTS_DEDUCTED' end,
    'PROFILE',target_user,
    jsonb_build_object('delta',point_delta,'category',v_category,'reason',v_reason,'manual_balance',v_balance,'total_score',v_total_score,'target_region_id',v_target_region,'source_type',source_type_text,'source_id',source_id_value,'notification_sent',notify_member,'awarded_by_nickname',v_actor_nickname,'awarded_by_role',v_actor_label)
  );

  return jsonb_build_object(
    'member_id',target_user,'delta',point_delta,'manual_balance',v_balance,'score',v_total_score,
    'category',v_category,'message_id',v_message_id,
    'suspended',v_total_score<=-10 and not public.ec_is_protected_admin_target(target_user),
    'awarded_by_nickname',v_actor_nickname,'awarded_by_role',v_actor_label
  );
end;
$function$;

create or replace function public.head_admin_adjust_own_points(
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
  v_balance integer;
  v_score integer;
  v_kind public.point_kind;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.'; end if;
  if p_delta is null or p_delta=0 then raise exception 'Punkteänderung darf nicht 0 sein.'; end if;
  if char_length(v_reason)>500 then raise exception 'Begründung ist zu lang.'; end if;

  if not exists(
    select 1 from public.profiles
    where id=v_uid and account_status='ACTIVE' and upper(role::text)='HEAD_ADMIN'
  ) then
    raise exception 'Nur der aktive Head Admin darf eigene Punkte ändern.';
  end if;

  update public.profiles
  set points=coalesce(points,0)+p_delta,
      updated_at=now()
  where id=v_uid
  returning points into v_balance;

  v_kind := case when p_delta>0 then 'PLUS'::public.point_kind else 'MINUS'::public.point_kind end;

  insert into public.point_transactions(
    member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated
  )
  values(
    v_uid,v_uid,v_kind,p_delta,v_reason,'HEAD_ADMIN_SELF','HEAD_ADMIN_SELF',null,false
  );

  insert into public.point_history(user_id,amount,delta,reason,changed_by)
  values(v_uid,p_delta,p_delta,v_reason,v_uid);

  select coalesce((private.ec_activity_score(v_uid)->>'score')::integer,0)
  into v_score;

  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(
    v_uid,
    case when p_delta>0 then 'HEAD_ADMIN_SELF_POINTS_AWARDED' else 'HEAD_ADMIN_SELF_POINTS_DEDUCTED' end,
    'PROFILE',
    v_uid,
    jsonb_build_object('delta',p_delta,'reason',v_reason,'manual_balance',v_balance,'total_score',v_score)
  );

  return jsonb_build_object(
    'member_id',v_uid,'delta',p_delta,'manual_balance',v_balance,'score',v_score
  );
end;
$function$;

revoke all on function public.head_admin_adjust_own_points(integer,text) from public, anon;
grant execute on function public.head_admin_adjust_own_points(integer,text) to authenticated;
