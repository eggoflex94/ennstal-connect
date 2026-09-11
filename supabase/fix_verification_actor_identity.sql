-- Ennstal Connect
-- Automatic verification confirmations must identify the acting account by
-- nickname. The frontend derives the matching role star from that nickname.

create or replace function public.admin_set_profile_verification(p_user_id uuid,p_verified boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_was_verified boolean;
  v_actor_name text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Head Admin darf Verifizierungen verwalten.';
  end if;

  select is_verified into v_was_verified
  from public.profiles
  where id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;

  select coalesce(nullif(trim(nickname),''),'Administration')
  into v_actor_name
  from public.profiles
  where id=auth.uid();

  update public.profiles
  set is_verified=p_verified,
      verified_at=case when p_verified then now() else null end,
      verified_by=case when p_verified then auth.uid() else null end,
      verification_required_at=null,
      verification_due_at=null
  where id=p_user_id;

  update public.verification_requests
  set status=case when p_verified then 'APPROVED' else 'DECLINED' end,
      reviewed_at=now(),
      reviewed_by=auth.uid(),
      proof_retained=false,
      privacy_note=coalesce(privacy_note,'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.')
  where user_id=p_user_id and status='PENDING';

  if p_verified and not coalesce(v_was_verified,false) and p_user_id<>auth.uid() then
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
    values(
      auth.uid(),
      p_user_id,
      v_actor_name || E' hat dein Profil verifiziert.\nDein Profil wurde erfolgreich verifiziert. Die erfolgreiche Prüfung ist jetzt in deinem Profil sichtbar.',
      false,
      now()
    );
  end if;
end;
$$;

revoke execute on function public.admin_set_profile_verification(uuid,boolean) from public, anon;
grant execute on function public.admin_set_profile_verification(uuid,boolean) to authenticated;

notify pgrst, 'reload schema';
