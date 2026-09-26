-- Content RPCs below are only used after a signed-in user is established.
-- Remove anonymous execution while preserving authenticated access.

revoke execute on function public.community_group_directory() from public, anon;
grant execute on function public.community_group_directory() to authenticated;

revoke execute on function public.ec_get_community_announcements(text) from public, anon;
grant execute on function public.ec_get_community_announcements(text) to authenticated;

revoke execute on function public.ec_get_global_community_announcement() from public, anon;
grant execute on function public.ec_get_global_community_announcement() to authenticated;

revoke execute on function public.ec_region_featured_community_group(uuid) from public, anon;
grant execute on function public.ec_region_featured_community_group(uuid) to authenticated;

revoke execute on function public.ec_region_group_directory(uuid) from public, anon;
grant execute on function public.ec_region_group_directory(uuid) to authenticated;

revoke execute on function public.ec_region_weekly_poll_current(uuid) from public, anon;
grant execute on function public.ec_region_weekly_poll_current(uuid) to authenticated;

revoke execute on function public.featured_community_group() from public, anon;
grant execute on function public.featured_community_group() to authenticated;

revoke execute on function public.weekly_poll_current() from public, anon;
grant execute on function public.weekly_poll_current() to authenticated;
