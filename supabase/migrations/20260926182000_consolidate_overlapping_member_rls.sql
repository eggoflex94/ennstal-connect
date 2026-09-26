-- Consolidate overlapping permissive policies whose broader policy already
-- defines the effective access for signed-in users. Access semantics remain
-- unchanged; redundant evaluations are removed.

-- friendships
drop policy if exists "users send friend requests" on public.friendships;
drop policy if exists "users read own friendships" on public.friendships;
drop policy if exists "receiver updates friendship" on public.friendships;

-- messages
drop policy if exists users_can_send_messages on public.messages;
drop policy if exists messages_select on public.messages;
drop policy if exists users_can_read_own_messages on public.messages;
drop policy if exists receivers_can_mark_messages_read on public.messages;

-- profile activity
drop policy if exists profile_activity_create on public.profile_activity;
drop policy if exists profile_activity_read on public.profile_activity;

-- profile visits
drop policy if exists profile_visits_create on public.profile_visits;
drop policy if exists "users read profile visits" on public.profile_visits;
drop policy if exists "visit owner reads" on public.profile_visits;
