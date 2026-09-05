-- Ennstal Connect
-- Registration repair: signup must create an immediate profile and queue an
-- authenticity review without making the review/notification a signup blocker.

create or replace function public.ec_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_nickname text;
  v_nickname text;
  v_first_name text;
  v_last_name text;
  v_birth_date date := date '2000-01-01';
  v_gender text;
  v_first_admin boolean;
  v_attempt integer := 0;
begin
  v_requested_nickname := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), '');
  if v_requested_nickname is null or char_length(v_requested_nickname) < 3 then
    v_requested_nickname := nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '');
  end if;
  if v_requested_nickname is null or char_length(v_requested_nickname) < 3 then
    v_requested_nickname := 'Mitglied';
  end if;

  v_nickname := v_requested_nickname;
  perform pg_advisory_xact_lock(hashtext('ennstal-nickname:' || lower(v_requested_nickname)));
  while exists (
    select 1
    from public.profiles
    where lower(btrim(coalesce(nickname, ''))) = lower(btrim(v_nickname))
  ) loop
    v_attempt := v_attempt + 1;
    v_nickname := left(v_requested_nickname, 80)
      || '-' || substr(replace(new.id::text, '-', ''), 1, 8)
      || case when v_attempt > 1 then '-' || v_attempt::text else '' end;
  end loop;

  v_first_name := btrim(coalesce(new.raw_user_meta_data ->> 'first_name', ''));
  v_last_name := btrim(coalesce(new.raw_user_meta_data ->> 'last_name', ''));

  begin
    if coalesce(new.raw_user_meta_data ->> 'birth_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_birth_date := (new.raw_user_meta_data ->> 'birth_date')::date;
    end if;
  exception when others then
    v_birth_date := date '2000-01-01';
  end;

  v_gender := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'gender', '')), '');
  if v_gender is not null and v_gender not in ('männlich', 'weiblich', 'divers') then
    v_gender := null;
  end if;

  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  select not exists (
    select 1 from public.profiles where role in ('ADMIN', 'HEAD_ADMIN')
  ) into v_first_admin;

  insert into public.profiles (
    id, nickname, first_name, last_name, birth_date, gender, role,
    account_status, is_verified, verification_required_at, verification_due_at
  ) values (
    new.id,
    v_nickname,
    v_first_name,
    v_last_name,
    v_birth_date,
    v_gender,
    case when v_first_admin then 'HEAD_ADMIN'::public.user_role else 'MEMBER'::public.user_role end,
    'ACTIVE',
    false,
    case when v_first_admin then null else now() end,
    case when v_first_admin then null else now() + interval '7 days' end
  )
  on conflict (id) do nothing;

  if not v_first_admin then
    begin
      insert into public.verification_requests(user_id, note, status)
      values (new.id, 'Automatische Echtheitsprüfung nach Registrierung.', 'PENDING')
      on conflict (user_id, status) do nothing;

      insert into public.messages(sender_id, receiver_id, content, is_read, created_at)
      select new.id,
             admin_profile.id,
             'Neue Registrierung: ' || v_nickname || ' hat sofort ein Profil erhalten. Bitte das Profil auf Echtheit prüfen.',
             false,
             now()
      from public.profiles admin_profile
      where admin_profile.role in ('HEAD_ADMIN', 'ADMIN')
        and admin_profile.account_status = 'ACTIVE'
        and admin_profile.id <> new.id;
    exception when others then
      -- Notification/review failures must never roll back a valid signup.
      null;
    end;
  end if;

  return new;
end;
$$;

revoke execute on function public.ec_handle_new_user() from public, anon, authenticated;

create or replace function public.ensure_current_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_nickname text;
  v_nickname text;
  v_birth_date_text text;
  v_first_name text;
  v_last_name text;
  v_birth_date date := date '2000-01-01';
  v_gender text;
  v_first_admin boolean;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    return;
  end if;

  if exists(select 1 from public.profiles where id = auth.uid()) then
    update public.profiles
    set account_status = case when account_status = 'SUSPENDED' then account_status else 'ACTIVE' end
    where id = auth.uid();
    return;
  end if;

  select nullif(btrim(coalesce(raw_user_meta_data ->> 'nickname', '')), ''),
         btrim(coalesce(raw_user_meta_data ->> 'first_name', '')),
         btrim(coalesce(raw_user_meta_data ->> 'last_name', '')),
         nullif(btrim(coalesce(raw_user_meta_data ->> 'gender', '')), ''),
         raw_user_meta_data ->> 'birth_date'
  into v_requested_nickname, v_first_name, v_last_name, v_gender, v_birth_date_text
  from auth.users
  where id = auth.uid();

  if v_requested_nickname is null or char_length(v_requested_nickname) < 3 then
    select nullif(btrim(split_part(coalesce(email, ''), '@', 1)), '')
    into v_requested_nickname
    from auth.users
    where id = auth.uid();
  end if;
  if v_requested_nickname is null or char_length(v_requested_nickname) < 3 then
    v_requested_nickname := 'Mitglied';
  end if;

  begin
    if coalesce(v_birth_date_text, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_birth_date := v_birth_date_text::date;
    end if;
  exception when others then
    v_birth_date := date '2000-01-01';
  end;

  if v_gender is not null and v_gender not in ('männlich', 'weiblich', 'divers') then
    v_gender := null;
  end if;

  v_nickname := v_requested_nickname;
  perform pg_advisory_xact_lock(hashtext('ennstal-nickname:' || lower(v_requested_nickname)));
  while exists (
    select 1
    from public.profiles
    where lower(btrim(coalesce(nickname, ''))) = lower(btrim(v_nickname))
  ) loop
    v_attempt := v_attempt + 1;
    v_nickname := left(v_requested_nickname, 80)
      || '-' || substr(replace(auth.uid()::text, '-', ''), 1, 8)
      || case when v_attempt > 1 then '-' || v_attempt::text else '' end;
  end loop;

  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  if exists(select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN'))
  into v_first_admin;

  insert into public.profiles(
    id,nickname,first_name,last_name,birth_date,gender,role,account_status,
    is_verified,verification_required_at,verification_due_at
  ) values(
    auth.uid(),v_nickname,v_first_name,v_last_name,v_birth_date,v_gender,
    case when v_first_admin then 'HEAD_ADMIN'::public.user_role else 'MEMBER'::public.user_role end,
    'ACTIVE',false,
    case when v_first_admin then null else now() end,
    case when v_first_admin then null else now() + interval '7 days' end
  )
  on conflict (id) do nothing;

  if not v_first_admin then
    begin
      insert into public.verification_requests(user_id, note, status)
      values (auth.uid(), 'Automatische Echtheitsprüfung nach Registrierung.', 'PENDING')
      on conflict (user_id, status) do nothing;

      insert into public.messages(sender_id, receiver_id, content, is_read, created_at)
      select auth.uid(),
             admin_profile.id,
             'Neue Registrierung: ' || v_nickname || ' hat sofort ein Profil erhalten. Bitte das Profil auf Echtheit prüfen.',
             false,
             now()
      from public.profiles admin_profile
      where admin_profile.role in ('HEAD_ADMIN','ADMIN')
        and admin_profile.account_status = 'ACTIVE'
        and admin_profile.id <> auth.uid();
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke execute on function public.ensure_current_profile() from public, anon;
grant execute on function public.ensure_current_profile() to authenticated;

create or replace function public.nickname_available(p_nickname text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  -- Signup is anonymous. A requested duplicate is resolved by the signup
  -- trigger, so the existing frontend check must not block registration.
  select case
    when auth.uid() is null then true
    else not exists (
      select 1
      from public.profiles
      where lower(btrim(nickname)) = lower(btrim(coalesce(p_nickname, '')))
    )
  end;
$$;

revoke execute on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;
