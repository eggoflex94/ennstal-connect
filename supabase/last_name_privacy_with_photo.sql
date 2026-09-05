-- Ennstal Connect: Nachname nur für Admins + Profilfoto-Pflicht
-- Diese Regeln sind in der Live-Datenbank bereits als Migration aktiv.

create or replace function public.ec_validate_last_name_privacy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_last_name_visibility text;
begin
  -- Bestehende App-Versionen speichern privacy_settings noch ohne den neuen
  -- last_name-Schlüssel. In diesem Fall bleibt die aktuelle Einstellung erhalten.
  if tg_op = 'UPDATE' and not (coalesce(new.privacy_settings, '{}'::jsonb) ? 'last_name') then
    new.privacy_settings := jsonb_set(
      coalesce(new.privacy_settings, '{}'::jsonb),
      '{last_name}',
      to_jsonb(coalesce(old.privacy_settings ->> 'last_name', 'PUBLIC')),
      true
    );
  elsif tg_op = 'INSERT' and not (coalesce(new.privacy_settings, '{}'::jsonb) ? 'last_name') then
    new.privacy_settings := jsonb_set(
      coalesce(new.privacy_settings, '{}'::jsonb),
      '{last_name}',
      '"PUBLIC"'::jsonb,
      true
    );
  end if;

  v_last_name_visibility := coalesce(new.privacy_settings ->> 'last_name', 'PUBLIC');
  if v_last_name_visibility not in ('PUBLIC', 'ADMIN_ONLY') then
    raise exception 'Ungültige Nachnamen-Sichtbarkeit.';
  end if;

  if v_last_name_visibility = 'ADMIN_ONLY'
     and nullif(btrim(coalesce(new.avatar_url, '')), '') is null then
    raise exception 'Um deinen Nachnamen auszublenden, musst du zuerst ein Profilfoto hochladen.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_last_name_privacy_trigger on public.profiles;
create trigger validate_last_name_privacy_trigger
before insert or update of privacy_settings, avatar_url
on public.profiles
for each row execute function public.ec_validate_last_name_privacy();

revoke all on function public.ec_validate_last_name_privacy() from public;
revoke all on function public.ec_validate_last_name_privacy() from anon;
revoke all on function public.ec_validate_last_name_privacy() from authenticated;

create or replace function public.set_last_name_privacy(p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  update public.profiles
  set privacy_settings = jsonb_set(
    coalesce(privacy_settings, '{}'::jsonb),
    '{last_name}',
    to_jsonb(case when coalesce(p_hidden, false) then 'ADMIN_ONLY' else 'PUBLIC' end),
    true
  )
  where id = auth.uid();

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.set_last_name_privacy(boolean) from public;
revoke all on function public.set_last_name_privacy(boolean) from anon;
grant execute on function public.set_last_name_privacy(boolean) to authenticated;

create or replace function public.community_member_directory()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role in ('ADMIN', 'HEAD_ADMIN')
        and me.account_status = 'ACTIVE'
    ) as is_admin
  )
  select (
    to_jsonb(p)
    || jsonb_build_object(
      'last_name',
      case
        when viewer.is_admin then p.last_name
        when coalesce(p.privacy_settings ->> 'last_name', 'PUBLIC') = 'ADMIN_ONLY' then null
        else p.last_name
      end
    )
  )
         - 'login_email'
         - 'suspension_reason'
         - 'privacy_settings'
         - 'is_online'
         - 'last_active_at'
         - 'weekly_online_seconds'
         - 'weekly_reward_awarded_at'
         - 'warnings_count'
  from public.profiles p
  cross join viewer
  where auth.uid() is not null
    and p.account_status = 'ACTIVE'
    and not coalesce(p.is_test_account, false)
  order by
    case p.role
      when 'HEAD_ADMIN' then 1
      when 'ADMIN' then 2
      when 'SUPPORTER' then 3
      else 4
    end,
    lower(p.nickname);
$$;

revoke all on function public.community_member_directory() from public;
revoke all on function public.community_member_directory() from anon;
grant execute on function public.community_member_directory() to authenticated;

notify pgrst, 'reload schema';
