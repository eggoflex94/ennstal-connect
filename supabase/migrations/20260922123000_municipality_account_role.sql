-- Dedicated municipality account role and permissions.
-- Municipality accounts are tied to their home region and can manage that
-- region's official municipality area without receiving global admin rights.

alter type public.user_role add value if not exists 'MUNICIPALITY';

create or replace function public.ec_municipality_can_manage(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
      and (
        upper(p.role::text) in ('HEAD_ADMIN','ADMIN')
        or (upper(p.role::text) = 'MUNICIPALITY' and p.home_region_id = p_region_id)
      )
  )
  or exists (
    select 1
    from public.municipality_staff s
    join public.profiles p on p.id = s.user_id
    where s.region_id = p_region_id
      and s.user_id = auth.uid()
      and s.active
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
  );
$function$;

create or replace function public.ec_municipality_can_own(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
      and (
        upper(p.role::text) in ('HEAD_ADMIN','ADMIN')
        or (upper(p.role::text) = 'MUNICIPALITY' and p.home_region_id = p_region_id)
      )
  )
  or exists (
    select 1
    from public.municipality_staff s
    join public.profiles p on p.id = s.user_id
    where s.region_id = p_region_id
      and s.user_id = auth.uid()
      and s.active
      and s.staff_role = 'OWNER'
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
  );
$function$;

create or replace function public.admin_set_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_old_role text;
  v_action text;
  v_role_label text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Hauptadmin darf Rollen vergeben oder entziehen.';
  end if;
  if target_user is null or target_user=auth.uid() then
    raise exception 'Die eigene Rolle kann nicht verändert werden.';
  end if;
  if new_role not in ('MEMBER','SUPPORTER','ADMIN','MUNICIPALITY') then
    raise exception 'Ungültige Rolle.';
  end if;

  select role::text into v_old_role
  from public.profiles
  where id=target_user
  for update;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_old_role='HEAD_ADMIN' then raise exception 'Die Hauptadmin-Rolle ist geschützt.'; end if;
  if v_old_role=new_role then return; end if;

  if new_role='ADMIN' or v_old_role='ADMIN' then
    delete from public.admin_permissions where admin_id=target_user;
    update public.profiles
    set forum_moderator=false,admin_responsibilities='{}'::text[]
    where id=target_user;
  end if;

  update public.profiles
  set role=new_role::public.user_role
  where id=target_user;

  if new_role<>'MEMBER' then
    v_role_label:=case new_role
      when 'SUPPORTER' then 'die Rolle Supporter'
      when 'ADMIN' then 'die Rolle Global Admin'
      when 'MUNICIPALITY' then 'die Rolle Gemeinde'
      else 'die Rolle '||new_role
    end;
    perform public.ec_send_assignment_message(
      target_user,
      v_role_label,
      case new_role
        when 'SUPPORTER' then 'Dein Supporter-Rollenstern ist jetzt in deinem Profil sichtbar.'
        when 'ADMIN' then 'Deine einzelnen Admin-Berechtigungen werden separat durch den Hauptadmin festgelegt.'
        when 'MUNICIPALITY' then 'Dein Gemeindekonto ist mit einem grünen Stern und Rahmen gekennzeichnet. Der offizielle Gemeindebereich deiner Heimatregion ist für dich freigeschaltet.'
        else null
      end
    );
  else
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at,message_type)
    values(
      auth.uid(),target_user,
      'Deine bisherige Rolle '||case v_old_role
        when 'ADMIN' then 'Global Admin'
        when 'SUPPORTER' then 'Supporter'
        when 'MUNICIPALITY' then 'Gemeinde'
        else v_old_role
      end||E' wurde entfernt.\n\nDies ist eine automatisch generierte Nachricht.',
      false,now(),'ROLE'
    );
  end if;

  v_action:=case
    when new_role='MEMBER' and v_old_role<>'MEMBER' then 'ROLLE_ENTFERNT'
    when v_old_role='MEMBER' and new_role<>'MEMBER' then 'ROLLE_ERTEILT'
    else 'ROLLE_GEAENDERT'
  end;
  perform public.ec_audit_insert(
    v_action,'profil',target_user,target_user,null,
    jsonb_build_object('alte_rolle',v_old_role,'neue_rolle',new_role)
  );
end;
$function$;

revoke all on function public.ec_municipality_can_manage(uuid) from public, anon;
revoke all on function public.ec_municipality_can_own(uuid) from public, anon;
grant execute on function public.ec_municipality_can_manage(uuid) to authenticated;
grant execute on function public.ec_municipality_can_own(uuid) to authenticated;


create or replace function public.ec_is_protected_admin_target(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_target
      and (
        upper(p.role::text) in ('HEAD_ADMIN','ADMIN','MUNICIPALITY')
        or exists (
          select 1
          from public.regional_admin_assignments ra
          where ra.user_id = p.id
            and ra.active = true
        )
      )
  );
$function$;
