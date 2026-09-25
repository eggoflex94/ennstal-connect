create or replace function public.admin_set_profile_verification(p_user_id uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_was_verified boolean;
  v_actor_name text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Hauptadmin darf Verifizierungen verwalten.';
  end if;

  -- Keep the same profile lock order as record_online_time(): actor first,
  -- target second. This avoids the actor/target deadlock observed in production.
  select coalesce(nullif(trim(nickname),''),'Administration')
    into v_actor_name
  from public.profiles
  where id = auth.uid()
  for update;

  select is_verified
    into v_was_verified
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;

  update public.profiles
  set is_verified = p_verified,
      verified_at = case when p_verified then now() else null end,
      verified_by = case when p_verified then auth.uid() else null end,
      verification_required_at = null,
      verification_due_at = null
  where id = p_user_id;

  update public.verification_requests
  set status = case when p_verified then 'APPROVED' else 'DECLINED' end,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      proof_retained = false,
      privacy_note = coalesce(
        privacy_note,
        'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.'
      )
  where user_id = p_user_id
    and status = 'PENDING';

  if p_verified and not coalesce(v_was_verified,false) and p_user_id <> auth.uid() then
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at,message_type)
    values(
      auth.uid(),
      p_user_id,
      'Du hast soeben von '||v_actor_name||E' eine Bestätigung deiner Profil-Verifizierung erhalten.\n\nDein Profil wurde erfolgreich geprüft. Die Verifizierung ist jetzt in deinem Profil sichtbar.\n\nDies ist eine automatisierte Nachricht.',
      false,
      now(),
      'VERIFICATION'
    );
  end if;

  perform public.ec_audit_insert(
    case when p_verified then 'VERIFIZIERUNG_FREIGEGEBEN' else 'VERIFIZIERUNG_ENTFERNT' end,
    'profil',
    p_user_id,
    p_user_id,
    null,
    jsonb_build_object('vorher',v_was_verified,'nachher',p_verified)
  );
end;
$function$;
