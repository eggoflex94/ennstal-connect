-- Narrow exception: the active primary operator may adjust delegated heads' manual points.
-- Every other protected field and the operator's protection against others remain intact.
do $change$
declare definition text;
begin
  select pg_get_functiondef('public.ec_guard_head_admin_profile()'::regprocedure) into definition;
  definition:=replace(definition,
    '  -- Ein anderer Head Admin darf ausschließlich Pluspunkte vergeben.',
    $patch$  -- Only the operator may make isolated manual point changes to another head.
  if v_actor_primary and upper(coalesce(v_actor_role,''))='HEAD_ADMIN'
     and new.points is distinct from old.points
     and new.purchase_points is not distinct from (case when exists(select 1 from public.kaufpunkte_initializations where user_id=old.id)
       then greatest(0,coalesce(old.purchase_points,0)+greatest(0,coalesce(new.points,0)-coalesce(old.points,0))*2) else old.purchase_points end)
     and (to_jsonb(new)-array['points','purchase_points','updated_at']) is not distinct from (to_jsonb(old)-array['points','purchase_points','updated_at']) then
    return new;
  end if;

  -- Ein anderer Head Admin darf ausschließlich Pluspunkte vergeben.$patch$);
  execute definition;

  select pg_get_functiondef('public.award_member_points(uuid,integer,text,text,boolean,text,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'  v_is_head_admin boolean := false;','  v_is_head_admin boolean := false; v_is_operator boolean := false;');
  definition:=replace(definition,
    '  v_is_head_admin := upper(coalesce(v_actor_role,''''))=''HEAD_ADMIN'';',
    $patch$  v_is_head_admin := upper(coalesce(v_actor_role,''))='HEAD_ADMIN';
  select exists(select 1 from public.profiles where id=v_actor and role::text='HEAD_ADMIN' and is_primary_head_admin=true and account_status='ACTIVE') into v_is_operator;$patch$);
  definition:=replace(definition,
    'and coalesce(is_primary_head_admin,false)=true',
    'and coalesce(is_primary_head_admin,false)=true and id<>v_actor');
  definition:=replace(definition,
    'if not public.ec_can_profile_admin_action(target_user,''manage_points'',null,false) then',
    'if not v_is_operator and not public.ec_can_profile_admin_action(target_user,''manage_points'',null,false) then');
  execute definition;

  -- The legacy entry point uses the audited ledger for operator adjustments.
  select pg_get_functiondef('public.admin_change_points(uuid,integer,text,text)'::regprocedure) into definition;
  definition:=replace(definition,
    '  if not public.is_admin_or_head() then',
    $patch$  if exists(select 1 from public.profiles where id=auth.uid() and role::text='HEAD_ADMIN' and is_primary_head_admin=true and account_status='ACTIVE') then
    perform public.award_member_points(target_user,delta,coalesce(reason_text,''),'ADMIN_ADJUSTMENT',true,null,null);
    return;
  end if;
  if not public.is_admin_or_head() then$patch$);
  execute definition;
end;
$change$;
