-- Ennstal Connect: notify members when business account status changes.

create or replace function public.admin_set_business_account(
  p_user_id uuid,
  p_enabled boolean,
  p_company_name text default null::text,
  p_company_description text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_badge text;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Hauptadmin darf Unternehmenskonten verwalten.';
  end if;

  select account_badge
    into v_old_badge
  from public.profiles
  where id=p_user_id
  for update;

  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;

  update public.profiles
  set account_badge=case when p_enabled then 'BUSINESS' else 'STANDARD' end,
      company_name=case when p_enabled then nullif(trim(coalesce(p_company_name,'')),'') else null end,
      company_description=case when p_enabled then nullif(trim(coalesce(p_company_description,'')),'') else null end,
      business_jobs_enabled=case when p_enabled then coalesce(business_jobs_enabled,false) else false end
  where id=p_user_id;

  if p_enabled and coalesce(v_old_badge,'STANDARD') <> 'BUSINESS' then
    insert into public.notifications(user_id,title,body,type)
    values (
      p_user_id,
      'Unternehmerkonto freigeschaltet ★',
      'Dein Unternehmerkonto wurde freigeschaltet. Du kannst jetzt dein Unternehmensprofil erweitern, Speisekarten und Dokumente hochladen sowie eigene Veranstaltungen erstellen und hervorheben. Stellenanzeigen werden separat von Ennstal Connect freigeschaltet.',
      'BUSINESS_ACCOUNT'
    );
  elsif not p_enabled and coalesce(v_old_badge,'STANDARD') = 'BUSINESS' then
    insert into public.notifications(user_id,title,body,type)
    values (
      p_user_id,
      'Unternehmerkonto geändert',
      'Dein Unternehmerstatus wurde entfernt. Die zusätzlichen Unternehmensfunktionen sind damit nicht mehr verfügbar.',
      'BUSINESS_ACCOUNT'
    );
  end if;

  perform public.ec_audit_insert(
    case when p_enabled then 'UNTERNEHMENSKONTO_ERTEILT' else 'UNTERNEHMENSKONTO_ENTFERNT' end,
    'profil',
    p_user_id,
    p_user_id,
    p_company_description,
    jsonb_build_object(
      'vorher',v_old_badge,
      'nachher',case when p_enabled then 'BUSINESS' else 'STANDARD' end,
      'firmenname',p_company_name
    )
  );
end;
$function$;

notify pgrst, 'reload schema';


-- Backfill the activation notification for business accounts that already existed
-- before automatic notifications were introduced.
insert into public.notifications(user_id,title,body,type)
select
  p.id,
  'Unternehmerkonto freigeschaltet ★',
  'Dein Unternehmerkonto wurde freigeschaltet. Du kannst jetzt dein Unternehmensprofil erweitern, Speisekarten und Dokumente hochladen sowie eigene Veranstaltungen erstellen und hervorheben. Stellenanzeigen werden separat von Ennstal Connect freigeschaltet.',
  'BUSINESS_ACCOUNT'
from public.profiles p
where p.account_badge='BUSINESS'
  and not exists (
    select 1
    from public.notifications n
    where n.user_id=p.id
      and n.type='BUSINESS_ACCOUNT'
      and n.title='Unternehmerkonto freigeschaltet ★'
  );
