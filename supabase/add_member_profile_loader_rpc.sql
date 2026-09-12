create or replace function public.community_member_profile(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select entry
  from public.community_member_directory() as entry
  where entry ->> 'id' = p_user::text
  limit 1;
$function$;

revoke all on function public.community_member_profile(uuid) from public;
revoke all on function public.community_member_profile(uuid) from anon;
grant execute on function public.community_member_profile(uuid) to authenticated;
