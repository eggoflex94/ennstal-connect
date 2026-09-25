revoke all on function public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) from public, anon;
grant execute on function public.admin_set_permissions(
  uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean
) to authenticated;

revoke all on function public.admin_get_permissions(uuid) from public, anon;
grant execute on function public.admin_get_permissions(uuid) to authenticated;
