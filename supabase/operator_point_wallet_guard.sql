do $change$
declare definition text;
begin
  select pg_get_functiondef('public.ec_guard_head_admin_profile()'::regprocedure) into definition;
  execute replace(definition,$old$and (to_jsonb(new)-array['points','updated_at']) is not distinct from (to_jsonb(old)-array['points','updated_at'])$old$,$new$and new.purchase_points is not distinct from (case when exists(select 1 from public.kaufpunkte_initializations where user_id=old.id)
       then greatest(0,coalesce(old.purchase_points,0)+greatest(0,coalesce(new.points,0)-coalesce(old.points,0))*2) else old.purchase_points end)
     and (to_jsonb(new)-array['points','purchase_points','updated_at']) is not distinct from (to_jsonb(old)-array['points','purchase_points','updated_at'])$new$);
end;
$change$;
