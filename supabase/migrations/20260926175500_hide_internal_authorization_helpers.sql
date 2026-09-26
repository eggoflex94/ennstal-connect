-- Internal authorization helpers are called by SECURITY DEFINER RPCs and do
-- not need their own direct PostgREST surface. Keep the one helper that the
-- current client explicitly calls.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and p.proname in (
        'ec_can_admin_region',
        'ec_can_manage_community_announcement',
        'ec_can_manage_homepage_region',
        'ec_can_manage_sidebar_banners',
        'ec_can_upload_popup_images',
        'ec_can_view_personal_data',
        'ec_has_admin_central_access',
        'ec_has_admin_permission',
        'ec_has_regional_admin_permission',
        'ec_has_regional_permission',
        'ec_is_admin',
        'ec_is_forum_moderator',
        'ec_is_global_admin_user',
        'ec_is_head_admin',
        'ec_is_head_admin_user',
        'ec_is_primary_head_admin',
        'ec_is_regional_admin'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;

-- This helper is intentionally client-facing and remains callable by signed-in users.
grant execute on function public.ec_can_manage_community_groups(uuid) to authenticated;
revoke execute on function public.ec_can_manage_community_groups(uuid) from public, anon;
