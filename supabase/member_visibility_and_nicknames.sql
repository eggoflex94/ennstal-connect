-- Ennstal Connect: complete member list and case-insensitive unique nicknames.
-- Run this file once in the Supabase SQL Editor.

-- Every signed-in member may see active community profiles. Blocking still
-- controls interaction, messages and requests, but does not make members
-- disappear from the directory.
alter table public.profiles enable row level security;
drop policy if exists "ec_profiles_visible" on public.profiles;
create policy "ec_profiles_visible"
on public.profiles
for select
to authenticated
using (id = auth.uid() or account_status = 'ACTIVE' or public.ec_is_admin());

-- Nicknames are compared without case or surrounding spaces: "Eggo" and
-- " eggo " therefore cannot be assigned to two different accounts.
create unique index if not exists profiles_nickname_unique_normalized
on public.profiles ((lower(btrim(nickname))))
where nickname is not null and btrim(nickname) <> '';

create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
    where lower(btrim(nickname)) = lower(btrim(coalesce(p_nickname, '')))
  );
$$;

revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;
notify pgrst, 'reload schema';
