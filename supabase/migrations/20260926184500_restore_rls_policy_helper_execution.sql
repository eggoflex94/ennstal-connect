-- RLS policies execute these helpers as the authenticated role.
-- They must therefore stay executable for authenticated while remaining hidden from anon.
grant execute on function public.ec_can_admin_region(uuid, uuid) to authenticated;
grant execute on function public.ec_can_manage_homepage_region(uuid, text) to authenticated;
grant execute on function public.ec_can_manage_sidebar_banners() to authenticated;
grant execute on function public.ec_can_profile_admin_action(uuid, text, text, boolean) to authenticated;
grant execute on function public.ec_can_upload_popup_images() to authenticated;
grant execute on function public.ec_has_admin_central_access(uuid) to authenticated;
grant execute on function public.ec_is_admin() to authenticated;
grant execute on function public.ec_is_head_admin() to authenticated;
grant execute on function public.ec_is_head_admin_user(uuid) to authenticated;

revoke execute on function public.ec_can_admin_region(uuid, uuid) from public, anon;
revoke execute on function public.ec_can_manage_homepage_region(uuid, text) from public, anon;
revoke execute on function public.ec_can_manage_sidebar_banners() from public, anon;
revoke execute on function public.ec_can_profile_admin_action(uuid, text, text, boolean) from public, anon;
revoke execute on function public.ec_can_upload_popup_images() from public, anon;
revoke execute on function public.ec_has_admin_central_access(uuid) from public, anon;
revoke execute on function public.ec_is_admin() from public, anon;
revoke execute on function public.ec_is_head_admin() from public, anon;
revoke execute on function public.ec_is_head_admin_user(uuid) from public, anon;

notify pgrst,'reload schema';
