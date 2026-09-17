revoke execute on function public.has_admin_permission(text) from public, anon;
revoke execute on function public.has_permission(text) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_admin_or_head() from public, anon;
revoke execute on function public.is_approved() from public, anon;
revoke execute on function public.is_head_admin() from public, anon;
revoke execute on function public.record_profile_visit(uuid) from public, anon;
revoke execute on function public.record_page_load_event(text,text,text) from public, anon;
