-- The signed-in app bootstrap calls this boolean capability RPC directly.
-- Keep it available to authenticated users only.
grant execute on function public.ec_can_view_personal_data() to authenticated;
revoke execute on function public.ec_can_view_personal_data() from public, anon;
