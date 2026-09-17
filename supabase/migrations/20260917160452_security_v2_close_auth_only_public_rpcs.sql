revoke execute on function public.ec_activity_feed(uuid) from public, anon;
grant execute on function public.ec_activity_feed(uuid) to authenticated;

revoke execute on function public.community_group_owner_change_queue() from public, anon;
grant execute on function public.community_group_owner_change_queue() to authenticated;
