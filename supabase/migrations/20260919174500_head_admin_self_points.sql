create or replace function public.head_admin_adjust_own_points(
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path='public','private','pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason,''));
  v_balance integer;
  v_score integer;
  v_kind public.point_kind;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.'; end if;
  if p_delta is null or p_delta=0 then raise exception 'Punkteänderung darf nicht 0 sein.'; end if;
  if abs(p_delta)>100 then raise exception 'Pro Vorgang sind maximal 100 Punkte erlaubt.'; end if;
  if char_length(v_reason)<10 then raise exception 'Bitte eine Begründung mit mindestens 10 Zeichen angeben.'; end if;
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
$$;

revoke all on function public.head_admin_adjust_own_points(integer,text) from public, anon;
grant execute on function public.head_admin_adjust_own_points(integer,text) to authenticated;
