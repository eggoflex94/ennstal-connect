-- Ennstal Connect: Business profile details, listings and broader community requests.

alter table public.profiles add column if not exists company_website text;
alter table public.profiles add column if not exists company_opening_hours text;

alter table public.community_requests drop constraint if exists community_requests_category_check;
alter table public.community_requests add constraint community_requests_category_check
  check (category in ('MITFAHREN','WANDERPARTNER','REGIONALER_TIPP','HILFE','SUCHE','BIETE','EMPFEHLUNG'));

create table if not exists public.business_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  listing_type text not null check (listing_type in ('OFFER','JOB','APPRENTICESHIP','EVENT')),
  title text not null check (char_length(trim(title)) between 3 and 140),
  body text not null check (char_length(trim(body)) between 3 and 2000),
  link_url text,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_listings_region_active_idx on public.business_listings(region_id,is_active,created_at desc);
create index if not exists business_listings_owner_idx on public.business_listings(owner_id,created_at desc);

alter table public.business_listings enable row level security;
grant select, insert, update, delete on public.business_listings to authenticated;

drop policy if exists business_listings_read on public.business_listings;
create policy business_listings_read on public.business_listings for select to authenticated
using (is_active=true or owner_id=auth.uid());

drop policy if exists business_listings_create on public.business_listings;
create policy business_listings_create on public.business_listings for insert to authenticated
with check (
  owner_id=auth.uid()
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_badge='BUSINESS')
);

drop policy if exists business_listings_update on public.business_listings;
create policy business_listings_update on public.business_listings for update to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());

drop policy if exists business_listings_delete on public.business_listings;
create policy business_listings_delete on public.business_listings for delete to authenticated
using (owner_id=auth.uid());

create or replace function public.update_my_business_profile(p_description text, p_website text, p_opening_hours text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_badge='BUSINESS') then
    raise exception 'Nur Unternehmenskonten können Unternehmensdaten bearbeiten.';
  end if;
  update public.profiles set
    company_description=nullif(trim(coalesce(p_description,'')),''),
    company_website=nullif(trim(coalesce(p_website,'')),''),
    company_opening_hours=nullif(trim(coalesce(p_opening_hours,'')),'')
  where id=auth.uid();
end;
$$;

revoke all on function public.update_my_business_profile(text,text,text) from public;
grant execute on function public.update_my_business_profile(text,text,text) to authenticated;
notify pgrst, 'reload schema';
