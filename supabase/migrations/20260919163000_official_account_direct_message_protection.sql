alter table public.profiles
  add column if not exists direct_messages_disabled boolean not null default false,
  add column if not exists direct_message_auto_reply text;

create or replace function public.head_admin_get_direct_message_policy(p_target_user uuid)
returns table(disabled boolean, auto_reply text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select upper(role::text) into v_role
  from public.profiles
  where id = auth.uid();

  if coalesce(v_role, '') <> 'HEAD_ADMIN' then
    raise exception 'Nur der Head Admin darf diese Einstellung einsehen.';
  end if;

  return query
  select coalesce(p.direct_messages_disabled, false), p.direct_message_auto_reply
  from public.profiles p
  where p.id = p_target_user;
end;
$function$;

create or replace function public.head_admin_set_direct_message_policy(
  p_target_user uuid,
  p_disabled boolean,
  p_auto_reply text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_reply text := nullif(btrim(coalesce(p_auto_reply, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;

  select upper(role::text) into v_role
  from public.profiles
  where id = auth.uid();

  if coalesce(v_role, '') <> 'HEAD_ADMIN' then
    raise exception 'Nur der Head Admin darf den Nachrichtenempfang eines Kontos verwalten.';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_user) then
    raise exception 'Konto nicht gefunden.';
  end if;

  if p_disabled and coalesce(length(v_reply), 0) < 10 then
    raise exception 'Bitte eine automatische Antwort mit mindestens 10 Zeichen angeben.';
  end if;

  update public.profiles
  set direct_messages_disabled = p_disabled,
      direct_message_auto_reply = case
        when p_disabled then v_reply
        else direct_message_auto_reply
      end,
      updated_at = now()
  where id = p_target_user;

  perform public.ec_audit_insert(
    case when p_disabled then 'DIREKTNACHRICHTEN_GESPERRT' else 'DIREKTNACHRICHTEN_FREIGEGEBEN' end,
    'profil',
    p_target_user,
    p_target_user,
    case when p_disabled then 'Direktnachrichten deaktiviert; automatische Antwort aktiviert.' else 'Direktnachrichten wieder aktiviert.' end,
    jsonb_build_object('disabled', p_disabled)
  );
end;
$function$;

revoke all on function public.head_admin_get_direct_message_policy(uuid) from public;
revoke all on function public.head_admin_get_direct_message_policy(uuid) from anon;
grant execute on function public.head_admin_get_direct_message_policy(uuid) to authenticated;

revoke all on function public.head_admin_set_direct_message_policy(uuid, boolean, text) from public;
revoke all on function public.head_admin_set_direct_message_policy(uuid, boolean, text) from anon;
grant execute on function public.head_admin_set_direct_message_policy(uuid, boolean, text) to authenticated;

create or replace function public.send_private_message(target_user uuid, message_text text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target_disabled boolean := false;
  v_auto_reply text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if target_user = auth.uid() then raise exception 'Du kannst dir selbst keine Nachricht senden.'; end if;
  if coalesce(length(trim(message_text)),0)=0 then raise exception 'Nachricht darf nicht leer sein.'; end if;

  if exists (
    select 1
    from public.user_feature_locks
    where user_id = auth.uid()
      and feature_key = 'MESSAGING'
      and is_locked = true
  ) then
    raise exception 'Deine Nachrichtenfunktion ist derzeit vorübergehend gesperrt.';
  end if;

  select coalesce(direct_messages_disabled, false), nullif(btrim(coalesce(direct_message_auto_reply, '')), '')
    into v_target_disabled, v_auto_reply
  from public.profiles
  where id = target_user
    and account_status = 'ACTIVE';

  if not found then
    raise exception 'Dieses Konto ist derzeit nicht erreichbar.';
  end if;

  if v_target_disabled then
    insert into public.messages (sender_id, receiver_id, content, is_read, message_type)
    values (
      target_user,
      auth.uid(),
      coalesce(v_auto_reply, 'Dieser Account empfängt keine Direktnachrichten. Bitte nutze den vorgesehenen Support- oder Kontaktbereich.'),
      false,
      'AUTO_REPLY'
    );
    return;
  end if;

  insert into public.messages (sender_id, receiver_id, content, is_read)
  values (auth.uid(), target_user, trim(message_text), false);
end;
$function$;

revoke insert on table public.messages from anon;
revoke insert on table public.messages from authenticated;
