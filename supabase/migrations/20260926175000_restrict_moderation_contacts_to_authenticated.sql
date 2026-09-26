-- Community moderation contacts contain member/profile identifiers and are
-- only displayed after sign-in. Remove the final anonymous SECURITY DEFINER RPC.
revoke execute on function public.community_moderation_contacts()
from public, anon;
grant execute on function public.community_moderation_contacts()
to authenticated;
