-- Ennstal Connect: allow business accounts to create community events in their home region.
drop policy if exists community_events_business_insert on public.community_events;

create policy community_events_business_insert
on public.community_events
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_badge = 'BUSINESS'
      and p.home_region_id = community_events.region_id
  )
);
