create table if not exists public.member_district_privacy (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  district_code text not null,
  visibility text not null check (visibility in ('PUBLIC','FRIENDS'))
);
alter table public.member_district_privacy enable row level security;
create policy "district owner read" on public.member_district_privacy for select to authenticated using (user_id = auth.uid());
create policy "district owner write" on public.member_district_privacy for insert to authenticated with check (user_id = auth.uid());
create policy "district owner edit" on public.member_district_privacy for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.visible_styrian_district(p_member uuid)
returns text language sql stable security definer set search_path = public as $$
 select case
 when d.visibility = 'PUBLIC' or p_member = auth.uid() or exists (
 select 1 from public.friendships f where f.status = 'ACCEPTED'
 and ((f.requester_id = auth.uid() and f.receiver_id = p_member)
 or (f.receiver_id = auth.uid() and f.requester_id = p_member))
 ) then d.district_code else null end
 from public.member_district_privacy d where d.user_id = p_member
$$;
grant execute on function public.visible_styrian_district(uuid) to authenticated;
