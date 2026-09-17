create or replace function public.is_admin_or_head()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('ADMIN','HEAD_ADMIN')
      and account_status = 'ACTIVE'
  );
$function$;

create or replace function public.admin_change_points(target_user uuid, delta integer, change_kind text, reason_text text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare new_points integer;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not public.is_admin_or_head() then raise exception 'Keine Berechtigung'; end if;
  if target_user is null then raise exception 'Kein Mitglied ausgewählt'; end if;
  if delta is null or delta=0 then raise exception 'Punkteänderung darf nicht 0 sein'; end if;
  if reason_text is null or length(trim(reason_text)) < 10 then raise exception 'Bitte eine Begründung mit mindestens 10 Zeichen angeben'; end if;
  if exists(select 1 from public.profiles where id=target_user and upper(role::text)='HEAD_ADMIN') then
    raise exception 'Punkte des Head Admins können nicht durch andere Admins verändert werden.';
  end if;
  update public.profiles set community_points=coalesce(community_points,0)+delta where id=target_user returning community_points into new_points;
  if not found then raise exception 'Mitglied nicht gefunden'; end if;
  insert into public.point_history(user_id,delta,reason) values(target_user,delta,trim(reason_text));
  if new_points <= -10 and not public.ec_is_protected_admin_target(target_user) then
    update public.profiles set account_status='SUSPENDED' where id=target_user;
  end if;
end;
$function$;
