-- Ennstal Connect: Head-admin approval for job and apprenticeship postings.
alter table public.profiles
  add column if not exists business_jobs_enabled boolean not null default false;

create or replace function public.admin_set_business_jobs_enabled(
  p_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge text;
  v_old boolean;
begin
  if not public.ec_is_head_admin() then
    raise exception 'Nur der Hauptadmin darf Stellenanzeigen für Unternehmenskonten freischalten.';
  end if;

  select account_badge, coalesce(business_jobs_enabled, false)
    into v_badge, v_old
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;

  if upper(coalesce(v_badge, '')) <> 'BUSINESS' then
    raise exception 'Stellenanzeigen können nur für Unternehmenskonten freigeschaltet werden.';
  end if;

  update public.profiles
  set business_jobs_enabled = p_enabled
  where id = p_user_id;

  perform public.ec_audit_insert(
    case when p_enabled then 'STELLENANZEIGEN_FREIGESCHALTET' else 'STELLENANZEIGEN_GESPERRT' end,
    'profil',
    p_user_id,
    p_user_id,
    null,
    jsonb_build_object('vorher', v_old, 'nachher', p_enabled)
  );
end;
$$;

revoke all on function public.admin_set_business_jobs_enabled(uuid, boolean) from public;
revoke execute on function public.admin_set_business_jobs_enabled(uuid, boolean) from anon;
grant execute on function public.admin_set_business_jobs_enabled(uuid, boolean) to authenticated;

drop policy if exists business_listings_create on public.business_listings;
create policy business_listings_create
on public.business_listings
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_badge = 'BUSINESS'
      and (
        business_listings.listing_type not in ('JOB','APPRENTICESHIP')
        or coalesce(p.business_jobs_enabled, false) = true
      )
  )
);

drop policy if exists business_listings_update on public.business_listings;
create policy business_listings_update
on public.business_listings
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.account_badge = 'BUSINESS'
      and (
        business_listings.listing_type not in ('JOB','APPRENTICESHIP')
        or coalesce(p.business_jobs_enabled, false) = true
      )
  )
);

create or replace function public.admin_set_business_account(p_user_id uuid, p_enabled boolean, p_company_name text default null::text, p_company_description text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_old_badge text;
begin
 if not public.ec_is_head_admin() then raise exception 'Nur der Hauptadmin darf Unternehmenskonten verwalten.'; end if;
 select account_badge into v_old_badge from public.profiles where id=p_user_id for update;
 if not found then raise exception 'Mitglied nicht gefunden.'; end if;
 update public.profiles
 set account_badge=case when p_enabled then 'BUSINESS' else 'STANDARD' end,
     company_name=case when p_enabled then nullif(trim(coalesce(p_company_name,'')),'') else null end,
     company_description=case when p_enabled then nullif(trim(coalesce(p_company_description,'')),'') else null end,
     business_jobs_enabled=case when p_enabled then coalesce(business_jobs_enabled,false) else false end
 where id=p_user_id;
 perform public.ec_audit_insert(case when p_enabled then 'UNTERNEHMENSKONTO_ERTEILT' else 'UNTERNEHMENSKONTO_ENTFERNT' end,'profil',p_user_id,p_user_id,p_company_description,jsonb_build_object('vorher',v_old_badge,'nachher',case when p_enabled then 'BUSINESS' else 'STANDARD' end,'firmenname',p_company_name));
end;
$function$;

notify pgrst, 'reload schema';
