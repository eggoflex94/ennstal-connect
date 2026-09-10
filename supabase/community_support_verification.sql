-- Ennstal Connect: Support, privacy-friendly verification and social notifications.
-- Safe to run repeatedly after regional_community_architecture.sql and community_expansion.sql.

create extension if not exists pgcrypto;

-- ---------- Notification foundation ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Benachrichtigung',
  body text not null default '',
  type text not null default 'GENERAL',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
revoke all on public.notifications from public;
grant select,update on public.notifications to authenticated;

alter table public.profiles add column if not exists notify_message_popup boolean not null default true;
alter table public.profiles add column if not exists notify_friend_request_popup boolean not null default true;
alter table public.profiles add column if not exists notify_forum_reply_popup boolean not null default true;

create or replace function public.member_notification_settings()
returns table(notify_message_popup boolean, notify_friend_request_popup boolean, notify_forum_reply_popup boolean)
language sql stable security definer set search_path=public as $$
  select p.notify_message_popup,p.notify_friend_request_popup,p.notify_forum_reply_popup
  from public.profiles p where p.id=auth.uid();
$$;
create or replace function public.member_update_notification_settings(p_message boolean,p_friend boolean,p_forum boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  update public.profiles set
    notify_message_popup=coalesce(p_message,true),
    notify_friend_request_popup=coalesce(p_friend,true),
    notify_forum_reply_popup=coalesce(p_forum,true)
  where id=auth.uid();
end; $$;
create or replace function public.member_mark_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=auth.uid();
$$;
create or replace function public.member_mark_all_notifications_read()
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;
  get diagnostics affected=row_count;
  return affected;
end; $$;
revoke all on function public.member_notification_settings() from public;
revoke all on function public.member_update_notification_settings(boolean,boolean,boolean) from public;
revoke all on function public.member_mark_notification_read(uuid) from public;
revoke all on function public.member_mark_all_notifications_read() from public;
grant execute on function public.member_notification_settings() to authenticated;
grant execute on function public.member_update_notification_settings(boolean,boolean,boolean) to authenticated;
grant execute on function public.member_mark_notification_read(uuid) to authenticated;
grant execute on function public.member_mark_all_notifications_read() to authenticated;

create or replace function public.ec_add_notification(p_user uuid,p_title text,p_body text,p_type text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications(user_id,title,body,type)
  values(p_user,left(coalesce(nullif(trim(p_title),''),'Benachrichtigung'),160),left(coalesce(p_body,''),700),upper(coalesce(nullif(trim(p_type),''),'GENERAL')));
end; $$;
revoke all on function public.ec_add_notification(uuid,text,text,text) from public;

-- ---------- Friendship request + acceptance notifications ----------
create or replace function public.ec_friendship_notification_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor_name text;
begin
  if tg_op='INSERT' and upper(coalesce(new.status::text,''))='PENDING' then
    select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into actor_name from public.profiles where id=new.requester_id;
    perform public.ec_add_notification(new.receiver_id,'Neue Freundschaftsanfrage',actor_name || ' hat dir eine Freundschaftsanfrage gesendet.','FRIEND_REQUEST');
    return new;
  end if;

  if tg_op='UPDATE' and upper(coalesce(new.status::text,''))='ACCEPTED' and upper(coalesce(old.status::text,'')) is distinct from 'ACCEPTED' then
    select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into actor_name from public.profiles where id=new.receiver_id;
    perform public.ec_add_notification(new.requester_id,'Freundschaftsanfrage angenommen',actor_name || ' hat deine Freundschaftsanfrage angenommen.','FRIEND_REQUEST');
    if to_regclass('public.messages') is not null then
      insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
      values(new.receiver_id,new.requester_id,actor_name || ' hat deine Freundschaftsanfrage angenommen. Ihr seid jetzt befreundet.',false,now());
    end if;
    return new;
  end if;
  return new;
end; $$;

do $$
begin
  if to_regclass('public.friendships') is not null then
    execute 'drop trigger if exists ec_friendship_notifications on public.friendships';
    execute 'create trigger ec_friendship_notifications after insert or update of status on public.friendships for each row execute function public.ec_friendship_notification_trigger()';
  end if;
end $$;

-- Private messages notify the receiver in real time. Automated friendship messages
-- deliberately skip a second MESSAGE notification because the FRIEND_REQUEST notification
-- already covers the same acceptance event.
create or replace function public.ec_message_notification_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor_name text;
begin
  if new.receiver_id is null or new.sender_id is null then return new; end if;
  if new.content like '%hat deine Freundschaftsanfrage angenommen. Ihr seid jetzt befreundet.%' then return new; end if;
  select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into actor_name from public.profiles where id=new.sender_id;
  perform public.ec_add_notification(new.receiver_id,'Neue Nachricht von ' || actor_name,left(coalesce(new.content,''),180),'MESSAGE');
  return new;
end; $$;
do $$
begin
  if to_regclass('public.messages') is not null then
    execute 'drop trigger if exists ec_message_notifications on public.messages';
    execute 'create trigger ec_message_notifications after insert on public.messages for each row execute function public.ec_message_notification_trigger()';
  end if;
end $$;

-- ---------- Privacy-friendly verification ----------
alter table public.verification_requests add column if not exists verification_method text;
alter table public.verification_requests add column if not exists proof_retained boolean not null default false;
alter table public.verification_requests add column if not exists privacy_note text;

-- Regional admins may start verification only for members whose home region is assigned
-- to them. Global admins (ADMIN / HEAD_ADMIN) may start it everywhere.
create or replace function public.admin_require_profile_verification(p_target_user uuid,p_reason text,p_due_days integer default 7)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_actor text;
  v_target_region uuid;
  v_can_start boolean := false;
  v_due timestamptz;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if p_target_user=auth.uid() then raise exception 'Für das eigene Profil bitte Support → Profil verifizieren verwenden.'; end if;
  if p_due_days not between 1 and 30 or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Ungültige Verifizierungsanfrage.'; end if;
  if exists(select 1 from public.profiles where id=p_target_user and is_verified) then raise exception 'Dieses Profil ist bereits verifiziert.'; end if;
  select home_region_id into v_target_region from public.profiles where id=p_target_user and account_status='ACTIVE';
  if v_target_region is null then raise exception 'Mitglied oder Heimatregion nicht gefunden.'; end if;

  v_can_start := public.ec_is_global_admin_user(auth.uid()) or public.ec_is_regional_admin(v_target_region,auth.uid());
  if not v_can_start then raise exception 'Du darfst Verifizierungen nur in deiner zugewiesenen Region anstoßen.'; end if;

  v_due := now()+make_interval(days=>p_due_days);
  update public.verification_requests
    set note=left(trim(p_reason),1000),status='PENDING',created_at=now(),reviewed_at=null,reviewed_by=null,
        verification_method=null,proof_retained=false,
        privacy_note='Kein Ausweisdokument dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.'
    where user_id=p_target_user and status='PENDING';
  if not found then
    insert into public.verification_requests(user_id,note,status,proof_retained,privacy_note)
    values(p_target_user,left(trim(p_reason),1000),'PENDING',false,'Kein Ausweisdokument dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.');
  end if;
  update public.profiles set verification_required_at=now(),verification_due_at=v_due where id=p_target_user;
  select coalesce(nullif(trim(nickname),''),'Die Administration') into v_actor from public.profiles where id=auth.uid();

  if to_regclass('public.messages') is not null then
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
    values(auth.uid(),p_target_user,
      v_actor || ' bittet dich, dein Profil bis ' || to_char(v_due,'DD.MM.YYYY') || E' zu verifizieren.\nGrund: ' || trim(p_reason) ||
      E'\n\nSo geht es: Öffne oben „Support“ → „Profil verifizieren“ und sende deine Anfrage. Für einen Nachweis bitte keine vollständigen Ausweiskopien oder sensiblen Dokumente im Chat hochladen. Wenn ein Nachweis nötig ist, stimme mit dem Support eine datensparsame persönliche/Video-Prüfung oder einen auf das Minimum reduzierten Nachweis ab.',
      false,now());
  end if;
  perform public.ec_add_notification(p_target_user,'Profil-Verifizierung erforderlich','Öffne Support → Profil verifizieren. Frist: ' || to_char(v_due,'DD.MM.YYYY') || '.','GENERAL');
end; $$;

-- Only the Head Admin can approve or reject a verification. No proof file is stored.
create or replace function public.head_admin_review_profile_verification(p_target_user uuid,p_approve boolean,p_method text default 'PERSOENLICH')
returns void language plpgsql security definer set search_path=public as $$
declare actor_name text; target_name text;
begin
  if not public.ec_is_head_admin_user(auth.uid()) then raise exception 'Nur der Hauptadmin darf Profil-Verifizierungen freigeben oder ablehnen.'; end if;
  if p_target_user=auth.uid() then raise exception 'Die eigene Verifizierung kann hier nicht geprüft werden.'; end if;
  if not exists(select 1 from public.verification_requests where user_id=p_target_user and status='PENDING') then raise exception 'Keine offene Verifizierungsanfrage gefunden.'; end if;

  update public.verification_requests set
    status=case when p_approve then 'APPROVED' else 'DECLINED' end,
    reviewed_at=now(),reviewed_by=auth.uid(),verification_method=left(upper(coalesce(nullif(trim(p_method),''),'PERSOENLICH')),40),proof_retained=false
  where user_id=p_target_user and status='PENDING';

  update public.profiles set
    is_verified=p_approve,
    verified_at=case when p_approve then now() else null end,
    verified_by=case when p_approve then auth.uid() else null end,
    verification_required_at=null,
    verification_due_at=null
  where id=p_target_user;

  select coalesce(nullif(trim(nickname),''),'Die Administration') into actor_name from public.profiles where id=auth.uid();
  select coalesce(nullif(trim(nickname),''),'Mitglied') into target_name from public.profiles where id=p_target_user;
  if to_regclass('public.messages') is not null then
    insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
    values(auth.uid(),p_target_user,case when p_approve then 'Dein Profil wurde verifiziert. Danke, ' || target_name || '.' else 'Deine Profil-Verifizierung wurde nicht freigegeben. Bitte wende dich über Support an ' || actor_name || '.' end,false,now());
  end if;
  perform public.ec_add_notification(p_target_user,case when p_approve then 'Profil verifiziert' else 'Verifizierung nicht freigegeben' end,case when p_approve then 'Deine Profil-Verifizierung wurde erfolgreich abgeschlossen.' else 'Bitte öffne Support für die nächsten Schritte.' end,'GENERAL');
end; $$;

-- Members can request their own verification without uploading identity documents.
create or replace function public.request_profile_verification(p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare v_head_admin uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and is_verified) then raise exception 'Dein Profil ist bereits verifiziert.'; end if;
  if exists(select 1 from public.verification_requests where user_id=auth.uid() and status='PENDING') then raise exception 'Deine Verifizierungsanfrage wird bereits geprüft.'; end if;
  insert into public.verification_requests(user_id,note,status,proof_retained,privacy_note)
  values(auth.uid(),left(trim(coalesce(p_note,'')),1000),'PENDING',false,'Kein Ausweisdokument dauerhaft speichern; nur Prüfergebnis, Zeitpunkt und Prüfer dokumentieren.');
  select id into v_head_admin from public.profiles where role='HEAD_ADMIN' and account_status='ACTIVE' order by created_at nulls last limit 1;
  select coalesce(nullif(trim(nickname),''),'Ein Mitglied') into v_name from public.profiles where id=auth.uid();
  if v_head_admin is not null then
    perform public.ec_add_notification(v_head_admin,'Neue Profil-Verifizierung',v_name || ' möchte das Profil verifizieren lassen.','GENERAL');
    if to_regclass('public.messages') is not null then
      insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
      values(auth.uid(),v_head_admin,'Ich möchte mein Profil verifizieren lassen. Bitte teile mir über Support mit, welche datensparsame Prüfmethode wir verwenden.',false,now());
    end if;
  end if;
end; $$;

revoke all on function public.admin_require_profile_verification(uuid,text,integer) from public;
revoke all on function public.head_admin_review_profile_verification(uuid,boolean,text) from public;
revoke all on function public.request_profile_verification(text) from public;
grant execute on function public.admin_require_profile_verification(uuid,text,integer) to authenticated;
grant execute on function public.head_admin_review_profile_verification(uuid,boolean,text) to authenticated;
grant execute on function public.request_profile_verification(text) to authenticated;

notify pgrst, 'reload schema';
