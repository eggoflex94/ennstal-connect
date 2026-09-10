-- Ennstal Connect: Support, privacy-friendly verification and social notifications.
-- Requires regional_community_architecture.sql and the existing notifications/messages schema.

-- Freundschaftsanfrage: Benachrichtigung beim Eingang.
-- Annahme: eine automatisch erzeugte Direktnachricht; der bestehende Nachrichten-Trigger
-- erzeugt daraus die normale MESSAGE-Benachrichtigung.
create or replace function public.ec_friendship_social_notice()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_name text;
begin
  if tg_op='INSERT' and upper(coalesce(new.status,''))='PENDING' then
    select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into v_name
    from public.profiles where id=new.requester_id;
    insert into public.notifications(user_id,title,body,type)
    values(new.receiver_id,'Neue Freundschaftsanfrage',v_name || ' hat dir eine Freundschaftsanfrage gesendet.','FRIEND_REQUEST');
    return new;
  end if;

  if tg_op='UPDATE'
     and upper(coalesce(new.status,''))='ACCEPTED'
     and upper(coalesce(old.status,'')) is distinct from 'ACCEPTED' then
    select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into v_name
    from public.profiles where id=new.receiver_id;
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
    values(new.receiver_id,new.requester_id,v_name || ' hat deine Freundschaftsanfrage angenommen. Ihr seid jetzt befreundet.',false,now());
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists ec_friendship_social_notice on public.friendships;
create trigger ec_friendship_social_notice
after insert or update of status on public.friendships
for each row execute function public.ec_friendship_social_notice();
revoke execute on function public.ec_friendship_social_notice() from public, anon, authenticated;

-- Datenschutz: keine Ausweiskopie als dauerhafte Verifizierungsakte.
-- Gespeichert werden Prüfmethode, Ergebnis, Zeitpunkt und Prüfer.
alter table public.verification_requests
  add column if not exists verification_method text,
  add column if not exists proof_retained boolean not null default false,
  add column if not exists privacy_note text;

update public.verification_requests
set proof_retained=false,
    privacy_note=coalesce(privacy_note,'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.')
where privacy_note is null;

-- Nur der Head Admin darf die Verifizierung tatsächlich freigeben oder entziehen.
create or replace function public.admin_set_profile_verification(p_user_id uuid,p_verified boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Head Admin darf Verifizierungen verwalten.';
  end if;

  update public.profiles
  set is_verified=p_verified,
      verified_at=case when p_verified then now() else null end,
      verified_by=case when p_verified then auth.uid() else null end,
      verification_required_at=null,
      verification_due_at=null
  where id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;

  update public.verification_requests
  set status=case when p_verified then 'APPROVED' else 'DECLINED' end,
      reviewed_at=now(),
      reviewed_by=auth.uid(),
      proof_retained=false,
      privacy_note=coalesce(privacy_note,'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.')
  where user_id=p_user_id and status='PENDING';
end;
$$;
revoke execute on function public.admin_set_profile_verification(uuid,boolean) from public, anon;
grant execute on function public.admin_set_profile_verification(uuid,boolean) to authenticated;

-- Globale Admins dürfen überall anstoßen; Regionaladmins ausschließlich in ihrer Region.
-- Die automatische Nachricht verweist auf den neuen Support-Einstieg und erklärt die
-- datensparsame Vorgehensweise.
create or replace function public.admin_require_profile_verification(p_target_user uuid,p_reason text,p_due_days integer default 7)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor text;
  v_target_region uuid;
  v_due_date date;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;

  select home_region_id into v_target_region
  from public.profiles
  where id=p_target_user and account_status='ACTIVE';
  if not found then raise exception 'Mitglied nicht gefunden oder nicht aktiv.'; end if;

  if not public.ec_is_global_admin_user(auth.uid())
     and not public.ec_is_regional_admin(v_target_region,auth.uid()) then
    raise exception 'Du darfst Verifizierungen nur in deiner zugewiesenen Region anstoßen.';
  end if;

  if p_target_user=auth.uid()
     or p_due_days not between 1 and 30
     or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Ungültige Verifizierungsanfrage.';
  end if;
  if exists(select 1 from public.profiles where id=p_target_user and is_verified) then
    raise exception 'Dieses Profil ist bereits verifiziert.';
  end if;

  update public.verification_requests
  set note=left(trim(p_reason),1000),created_at=now(),reviewed_at=null,reviewed_by=null,
      proof_retained=false,
      privacy_note='Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.'
  where user_id=p_target_user and status='PENDING';
  if not found then
    insert into public.verification_requests(user_id,note,status,proof_retained,privacy_note)
    values(p_target_user,left(trim(p_reason),1000),'PENDING',false,'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.');
  end if;

  v_due_date := (now()+make_interval(days=>p_due_days))::date;
  update public.profiles
  set verification_required_at=now(),verification_due_at=v_due_date
  where id=p_target_user;

  select coalesce(nullif(nickname,''),'Die Administration') into v_actor
  from public.profiles where id=auth.uid();

  insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
  values(
    auth.uid(),p_target_user,
    v_actor || ' hat eine Profil-Verifizierung bis ' || to_char(v_due_date,'DD.MM.YYYY') || E' angefordert.\nGrund: ' || trim(p_reason) ||
    E'\n\nSo geht es: Öffne oben „Support“ und wähle „Profil verifizieren“. Vereinbare dort mit dem Support bzw. Hauptadmin eine datensparsame persönliche oder Video-Bestätigung. Bitte sende keine vollständigen Ausweiskopien oder andere sensible Dokumente im Chat. Dauerhaft gespeichert wird nur das Prüfergebnis mit Zeitpunkt und Prüfer.',
    false,now()
  );
end;
$$;
revoke execute on function public.admin_require_profile_verification(uuid,text,integer) from public, anon;
grant execute on function public.admin_require_profile_verification(uuid,text,integer) to authenticated;

-- Mitglieder können die eigene Verifizierung über Support anfragen.
create or replace function public.request_profile_verification(p_note text default '')
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_head_admin uuid;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and is_verified) then
    raise exception 'Dein Profil ist bereits verifiziert.';
  end if;
  if exists(select 1 from public.verification_requests where user_id=auth.uid() and status='PENDING') then
    raise exception 'Deine Verifizierungsanfrage wird bereits geprüft.';
  end if;

  insert into public.verification_requests(user_id,note,status,proof_retained,privacy_note)
  values(auth.uid(),left(trim(coalesce(p_note,'')),1000),'PENDING',false,'Keine Nachweisdokumente dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.');

  select id into v_head_admin
  from public.profiles
  where role='HEAD_ADMIN' and account_status='ACTIVE'
  order by created_at nulls last
  limit 1;
  select coalesce(nullif(nickname,''),'Ein Mitglied') into v_name
  from public.profiles where id=auth.uid();

  if v_head_admin is not null and v_head_admin<>auth.uid() then
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
    values(auth.uid(),v_head_admin,
      v_name || ' hat eine Verifizierungsanfrage gestellt. Bitte eine datensparsame persönliche oder Video-Prüfung vereinbaren; keine vollständigen Ausweiskopien im Chat speichern.',
      false,now());
  end if;
end;
$$;
revoke execute on function public.request_profile_verification(text) from public, anon;
grant execute on function public.request_profile_verification(text) to authenticated;

notify pgrst, 'reload schema';
