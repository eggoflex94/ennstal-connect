create or replace function public.head_admin_set_municipality_account(
  p_target uuid,
  p_region_slug text,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region public.regions%rowtype;
  v_old_role text;
  v_new_role text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Hauptadmin darf Gemeindekonten vergeben oder entfernen.';
  end if;
  if p_target is null or p_target = auth.uid() then
    raise exception 'Das eigene Hauptadmin-Konto kann nicht als Gemeindekonto gesetzt werden.';
  end if;

  select role::text into v_old_role
  from public.profiles
  where id = p_target
  for update;

  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
  if v_old_role = 'HEAD_ADMIN' then raise exception 'Die Hauptadmin-Rolle ist geschützt.'; end if;

  if p_enabled then
    if nullif(trim(p_region_slug),'') is null then
      raise exception 'Bitte Gemeinde/Region auswählen.';
    end if;

    select * into v_region
    from public.regions
    where slug = trim(p_region_slug)
      and is_active = true
    limit 1;

    if not found then raise exception 'Region nicht gefunden oder nicht aktiv.'; end if;

    update public.profiles
    set role = 'MUNICIPALITY'::public.user_role,
        home_region_id = v_region.id
    where id = p_target;

    delete from public.admin_permissions where admin_id = p_target;
    update public.profiles
    set forum_moderator = false,
        admin_responsibilities = '{}'::text[]
    where id = p_target;

    perform public.ec_send_assignment_message(
      p_target,
      'die Rolle Gemeinde',
      'Dein Konto wurde als offizielles Gemeindekonto für '||v_region.name||' freigeschaltet. Grüner Stern, grüner Mitgliederrahmen und der Gemeindebereich sind jetzt aktiv.'
    );
    v_new_role := 'MUNICIPALITY';
  else
    if v_old_role <> 'MUNICIPALITY' then
      return jsonb_build_object('ok',true,'role',v_old_role,'changed',false);
    end if;

    update public.profiles
    set role = 'MEMBER'::public.user_role
    where id = p_target;

    insert into public.messages(sender_id,receiver_id,content,is_read,created_at,message_type)
    values(
      auth.uid(),p_target,
      E'Dein Gemeindekonto wurde entfernt. Dein Konto ist wieder ein normales Mitgliedskonto.\n\nDies ist eine automatisch generierte Nachricht.',
      false,now(),'ROLE'
    );
    v_new_role := 'MEMBER';
  end if;

  perform public.ec_audit_insert(
    case when p_enabled then 'GEMEINDEKONTO_ERTEILT' else 'GEMEINDEKONTO_ENTFERNT' end,
    'profil',
    p_target,
    p_target,
    null,
    jsonb_build_object(
      'alte_rolle',v_old_role,
      'neue_rolle',v_new_role,
      'region_slug',case when p_enabled then v_region.slug else null end
    )
  );

  return jsonb_build_object(
    'ok',true,
    'role',v_new_role,
    'region_id',case when p_enabled then v_region.id else null end,
    'region_name',case when p_enabled then v_region.name else null end,
    'changed',true
  );
end;
$function$;

revoke all on function public.head_admin_set_municipality_account(uuid,text,boolean) from public, anon;
grant execute on function public.head_admin_set_municipality_account(uuid,text,boolean) to authenticated;
