-- Keep point-based suspension consistent across all current and legacy point paths.
-- A non-protected account is automatically suspended once either manual point
-- balance reaches -10 or below. Suspension is sticky and must be lifted by an
-- authorized admin; earning points later does not silently reactivate an account.

create or replace function public.ec_enforce_point_auto_suspension()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $function$
declare
  v_protected boolean := false;
  v_threshold_hit boolean := false;
  v_reason text;
begin
  if new.id is null then
    return new;
  end if;

  v_protected := public.ec_is_protected_admin_target(new.id);
  v_threshold_hit :=
    coalesce(new.points, 0) <= -10
    or coalesce(new.community_points, 0) <= -10;

  if v_threshold_hit and not v_protected then
    v_reason := 'Automatische Sperre ab -10 Punkten.';

    new.account_status := 'SUSPENDED';
    new.status := 'SUSPENDED'::public.account_status;
    new.is_suspended := true;
    new.is_online := false;
    new.suspended_at := coalesce(new.suspended_at, now());
    new.suspended_by := coalesce(new.suspended_by, auth.uid());
    new.suspension_reason := coalesce(nullif(btrim(new.suspension_reason), ''), v_reason);
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_point_auto_suspension on public.profiles;
create trigger enforce_point_auto_suspension
before insert or update of points, community_points
on public.profiles
for each row
execute function public.ec_enforce_point_auto_suspension();

-- Make the point-transaction safeguard update every suspension field used by
-- the application instead of only the legacy is_suspended boolean.
create or replace function public.update_user_suspension()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_points integer := 0;
  v_community_points integer := 0;
  v_protected boolean := false;
begin
  select coalesce(points,0), coalesce(community_points,0)
    into v_points, v_community_points
  from public.profiles
  where id = new.member_id;

  if not found then
    return new;
  end if;

  v_protected := public.ec_is_protected_admin_target(new.member_id);

  if (v_points <= -10 or v_community_points <= -10) and not v_protected then
    update public.profiles
    set account_status = 'SUSPENDED',
        status = 'SUSPENDED'::public.account_status,
        is_suspended = true,
        is_online = false,
        suspended_at = coalesce(suspended_at, now()),
        suspension_reason = coalesce(nullif(btrim(suspension_reason),''),
          'Automatische Sperre ab -10 Punkten.')
    where id = new.member_id;
  end if;

  return new;
end;
$function$;

-- Repair existing non-protected accounts that already crossed the threshold
-- before the trigger was consistent.
update public.profiles p
set account_status = 'SUSPENDED',
    status = 'SUSPENDED'::public.account_status,
    is_suspended = true,
    is_online = false,
    suspended_at = coalesce(p.suspended_at, now()),
    suspension_reason = coalesce(nullif(btrim(p.suspension_reason),''),
      'Automatische Sperre ab -10 Punkten.')
where (coalesce(p.points,0) <= -10 or coalesce(p.community_points,0) <= -10)
  and not public.ec_is_protected_admin_target(p.id);
