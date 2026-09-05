-- Enforce layout rewards server-side; the client display alone is not trusted.
create or replace function public.enforce_profile_layout_unlock()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_required_hours integer;
begin
  if new.profile_layout is not distinct from old.profile_layout then return new; end if;
  if new.role::text in ('HEAD_ADMIN','ADMIN','SUPPORTER') or new.account_badge='BUSINESS' then return new; end if;
  v_required_hours := case new.profile_layout
    when 'standard' then 0 when 'alpine' then 5 when 'aurora' then 20
    when 'ocean' then 35 when 'slate' then 50 when 'ember' then 70
    when 'redwood' then 90 when 'lavender' then 110 when 'midnight' then 130
    when 'sunrise' then 150 when 'neon' then 180 else 2147483647 end;
  if coalesce(new.total_online_seconds,0) < v_required_hours*3600 then
    raise exception 'Dieses Layout wird erst ab % Online-Stunden freigeschaltet.',v_required_hours;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_profile_layout_unlock on public.profiles;
create trigger enforce_profile_layout_unlock
before update of profile_layout on public.profiles
for each row execute function public.enforce_profile_layout_unlock();

revoke all on function public.enforce_profile_layout_unlock() from public,anon,authenticated;
notify pgrst,'reload schema';
