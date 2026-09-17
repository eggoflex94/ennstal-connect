revoke execute on function public.ec_set_global_admin(uuid,boolean) from public, anon;
revoke execute on function public.save_admin_permissions(uuid,jsonb) from public, anon;
revoke execute on function public.ec_refresh_member_activity(uuid) from public, anon;

revoke execute on function public.admin_set_account_status(uuid,text,text) from public, anon;
revoke execute on function public.admin_set_role(uuid,text) from public, anon;
revoke execute on function public.head_admin_suspend_user(uuid,text) from public, anon;
