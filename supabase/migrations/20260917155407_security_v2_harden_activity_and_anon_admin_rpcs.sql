alter table public.member_activity_days enable row level security;
revoke all privileges on table public.member_activity_days from anon, authenticated;

revoke execute on function public.admin_set_account_status(uuid,text,text) from anon;
revoke execute on function public.admin_set_role(uuid,text) from anon;
revoke execute on function public.ec_set_global_admin(uuid,boolean) from anon;
revoke execute on function public.head_admin_suspend_user(uuid,text) from anon;
revoke execute on function public.save_admin_permissions(uuid,jsonb) from anon;
