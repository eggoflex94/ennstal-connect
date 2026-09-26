-- Allow the additional regional color layouts while keeping the same unlock
-- rules for Connect Rot and Connect Blau.
create or replace function public.enforce_profile_layout_unlock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_progress jsonb;
begin
  if new.profile_layout is not distinct from old.profile_layout then return new; end if;

  if new.profile_layout not in (
    'standard',
    'theme-red',
    'theme-blue',
    'theme-neon',
    'theme-alpine',
    'theme-teal',
    'theme-violet'
  ) then
    raise exception 'Dieses Layout ist nicht verfügbar.';
  end if;

  if upper(new.role::text) in ('HEAD_ADMIN','ADMIN','SUPPORTER')
     or new.account_badge='BUSINESS' then
    return new;
  end if;

  v_progress := private.ec_activity_score(new.id);

  if new.profile_layout = 'theme-red'
     and coalesce((v_progress->>'red_unlocked')::boolean,false) is not true then
    raise exception 'Connect Rot wird ab 30 Aktivitätspunkten freigeschaltet.';
  end if;

  if new.profile_layout = 'theme-blue'
     and coalesce((v_progress->>'blue_unlocked')::boolean,false) is not true then
    raise exception 'Connect Blau wird ab 150 Aktivitätspunkten freigeschaltet.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_profile_layout_unlock() from public,anon,authenticated;
notify pgrst,'reload schema';
