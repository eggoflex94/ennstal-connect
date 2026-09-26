-- Prestige color layouts: regular members unlock them through community points.
-- Head admins, admins, supporters and business accounts bypass the thresholds.
-- Municipality accounts keep their municipality role styling and do not receive
-- a privileged bypass here.
create or replace function public.enforce_profile_layout_unlock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_score integer := 0;
  v_progress jsonb;
  v_required integer := 0;
begin
  if new.profile_layout is not distinct from old.profile_layout then
    return new;
  end if;

  if new.profile_layout not in (
    'standard',
    'theme-red',
    'theme-alpine',
    'theme-blue',
    'theme-teal',
    'theme-violet',
    'theme-copper',
    'theme-aurora',
    'theme-neon'
  ) then
    raise exception 'Dieses Layout ist nicht verfügbar.';
  end if;

  if upper(new.role::text) in ('HEAD_ADMIN','ADMIN','SUPPORTER')
     or new.account_badge = 'BUSINESS' then
    return new;
  end if;

  v_required := case new.profile_layout
    when 'standard' then 0
    when 'theme-red' then 30
    when 'theme-alpine' then 75
    when 'theme-blue' then 150
    when 'theme-teal' then 300
    when 'theme-violet' then 450
    when 'theme-copper' then 650
    when 'theme-aurora' then 900
    when 'theme-neon' then 1200
    else 2147483647
  end;

  if v_required = 0 then
    return new;
  end if;

  v_progress := private.ec_activity_score(new.id);
  v_score := coalesce((v_progress->>'score')::integer, 0);

  if v_score < v_required then
    raise exception 'Dieses Layout wird ab % Aktivitätspunkten freigeschaltet.', v_required;
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_profile_layout_unlock() from public, anon, authenticated;
notify pgrst,'reload schema';
