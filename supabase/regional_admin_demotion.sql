-- Head-admin controlled global -> regional admin demotion.
-- Keeps all moderation authority scoped to the selected region.

create or replace function public.ec_demote_global_to_regional_admin(
  p_target uuid,
  p_region_slug text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  region_uuid uuid;
  target_role text;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then
    raise exception 'Nur der Hauptadmin darf Globaladmins zu Regionaladmins herabsetzen.';
  end if;
  if p_target=auth.uid() then
    raise exception 'Die eigene Hauptadmin-Rolle kann hier nicht geändert werden.';
  end if;
  target_role:=public.ec_role_text(p_target);
  if target_role='HEAD_ADMIN' then
    raise exception 'Ein Hauptadmin kann nicht herabgesetzt werden.';
  end if;
  if target_role<>'ADMIN' then
    raise exception 'Das Mitglied ist kein Global Admin.';
  end if;
  select id into region_uuid from public.regions where slug=p_region_slug and is_active;
  if region_uuid is null then raise exception 'Region nicht gefunden.'; end if;

  -- Remove global authority first, then explicitly grant only the regional scope.
  update public.profiles
     set role='SUPPORTER', home_region_id=region_uuid, home_region_changed_at=now()
   where id=p_target;

  update public.regional_admin_assignments set active=false,updated_at=now() where user_id=p_target;
  insert into public.regional_admin_assignments(user_id,region_id,granted_by,active,updated_at)
  values(p_target,region_uuid,auth.uid(),true,now())
  on conflict(user_id,region_id) do update
    set active=true,granted_by=excluded.granted_by,updated_at=now();
end;
$$;

grant execute on function public.ec_demote_global_to_regional_admin(uuid,text) to authenticated;
