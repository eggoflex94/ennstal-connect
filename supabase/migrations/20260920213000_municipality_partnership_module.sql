-- Municipality partnership module for Ennstal Connect.
-- Adds verified municipality profiles, official notices, municipality staff roles,
-- and private citizen requests scoped to an existing Ennstal Connect region.

create table if not exists public.municipality_profiles (
  region_id uuid primary key references public.regions(id) on delete cascade,
  official_name text not null,
  short_description text not null default '',
  website text,
  contact_email text,
  phone text,
  address text,
  logo_url text,
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.municipality_staff (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  staff_role text not null default 'EDITOR' check (staff_role in ('OWNER','EDITOR')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id),
  unique(region_id, user_id)
);

create table if not exists public.municipality_notices (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 180),
  body text not null check (char_length(btrim(body)) between 3 and 5000),
  category text not null default 'INFO' check (category in ('INFO','TRAFFIC','WATER','WASTE','EVENT','EMERGENCY','OTHER')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL','IMPORTANT','URGENT')),
  pinned boolean not null default false,
  published boolean not null default true,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.citizen_requests (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'OTHER' check (category in ('ROAD','LIGHTING','WASTE','PLAYGROUND','GREENSPACE','TRAFFIC','PUBLIC_SPACE','OTHER')),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  description text not null check (char_length(btrim(description)) between 5 and 4000),
  location_text text,
  status text not null default 'NEW' check (status in ('NEW','REVIEWING','IN_PROGRESS','DONE','REJECTED')),
  municipality_note text,
  handled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists municipality_notices_region_published_idx
  on public.municipality_notices(region_id, published, pinned desc, created_at desc);
create index if not exists municipality_staff_region_active_idx
  on public.municipality_staff(region_id, active);
create index if not exists municipality_staff_user_active_idx
  on public.municipality_staff(user_id, active);
create index if not exists citizen_requests_region_status_idx
  on public.citizen_requests(region_id, status, updated_at desc);
create index if not exists citizen_requests_reporter_idx
  on public.citizen_requests(reporter_id, created_at desc);

alter table public.municipality_profiles enable row level security;
alter table public.municipality_staff enable row level security;
alter table public.municipality_notices enable row level security;
alter table public.citizen_requests enable row level security;

create or replace function public.ec_municipality_can_manage(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
      and upper(p.role::text) in ('HEAD_ADMIN','ADMIN')
  )
  or exists (
    select 1
    from public.municipality_staff s
    join public.profiles p on p.id = s.user_id
    where s.region_id = p_region_id
      and s.user_id = auth.uid()
      and s.active
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
  );
$function$;

create or replace function public.ec_municipality_can_own(p_region_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
      and upper(p.role::text) in ('HEAD_ADMIN','ADMIN')
  )
  or exists (
    select 1
    from public.municipality_staff s
    join public.profiles p on p.id = s.user_id
    where s.region_id = p_region_id
      and s.user_id = auth.uid()
      and s.active
      and s.staff_role = 'OWNER'
      and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
  );
$function$;

drop policy if exists municipality_profiles_read on public.municipality_profiles;
create policy municipality_profiles_read on public.municipality_profiles
for select to authenticated
using (active or public.ec_municipality_can_manage(region_id));

drop policy if exists municipality_staff_manager_read on public.municipality_staff;
create policy municipality_staff_manager_read on public.municipality_staff
for select to authenticated
using (public.ec_municipality_can_manage(region_id));

drop policy if exists municipality_notices_read on public.municipality_notices;
create policy municipality_notices_read on public.municipality_notices
for select to authenticated
using (published or public.ec_municipality_can_manage(region_id));

drop policy if exists citizen_requests_read on public.citizen_requests;
create policy citizen_requests_read on public.citizen_requests
for select to authenticated
using (reporter_id = auth.uid() or public.ec_municipality_can_manage(region_id));

revoke insert, update, delete on public.municipality_profiles from public, anon, authenticated;
revoke insert, update, delete on public.municipality_staff from public, anon, authenticated;
revoke insert, update, delete on public.municipality_notices from public, anon, authenticated;
revoke insert, update, delete on public.citizen_requests from public, anon, authenticated;
grant select on public.municipality_profiles to authenticated;
grant select on public.municipality_staff to authenticated;
grant select on public.municipality_notices to authenticated;
grant select on public.citizen_requests to authenticated;

create or replace function public.ec_municipality_context(p_region_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_region public.regions%rowtype;
  v_can_manage boolean := false;
  v_is_head boolean := false;
  v_profile jsonb;
  v_notices jsonb;
  v_requests jsonb;
  v_staff jsonb := '[]'::jsonb;
  v_counts jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_region
  from public.regions
  where slug = trim(p_region_slug)
    and is_active
  limit 1;

  if not found then raise exception 'Region nicht gefunden'; end if;

  v_can_manage := public.ec_municipality_can_manage(v_region.id);
  select exists(
    select 1 from public.profiles
    where id=v_user and coalesce(account_status,'ACTIVE')='ACTIVE' and upper(role::text)='HEAD_ADMIN'
  ) into v_is_head;

  select coalesce(to_jsonb(mp), jsonb_build_object(
    'region_id',v_region.id,
    'official_name',v_region.name,
    'short_description','',
    'website',null,
    'contact_email',null,
    'phone',null,
    'address',null,
    'logo_url',null,
    'verified',false,
    'active',false
  ))
  into v_profile
  from (select 1) seed
  left join public.municipality_profiles mp on mp.region_id=v_region.id;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.pinned desc, n.created_at desc),'[]'::jsonb)
  into v_notices
  from (
    select id,region_id,title,body,category,priority,pinned,published,published_at,created_at,updated_at
    from public.municipality_notices
    where region_id=v_region.id
      and (published or v_can_manage)
    order by pinned desc, created_at desc
    limit 30
  ) n;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
  into v_requests
  from (
    select id,region_id,category,title,description,location_text,status,municipality_note,created_at,updated_at,resolved_at
    from public.citizen_requests
    where region_id=v_region.id
      and reporter_id=v_user
    order by created_at desc
    limit 50
  ) r;

  if v_can_manage then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,
      'user_id',s.user_id,
      'nickname',coalesce(p.nickname,p.first_name,'Mitglied'),
      'staff_role',s.staff_role,
      'active',s.active
    ) order by coalesce(p.nickname,p.first_name,'')),'[]'::jsonb)
    into v_staff
    from public.municipality_staff s
    join public.profiles p on p.id=s.user_id
    where s.region_id=v_region.id;
  end if;

  select jsonb_build_object(
    'open_total', count(*) filter (where status in ('NEW','REVIEWING','IN_PROGRESS')),
    'new_total', count(*) filter (where status='NEW'),
    'in_progress_total', count(*) filter (where status='IN_PROGRESS'),
    'done_total', count(*) filter (where status='DONE')
  )
  into v_counts
  from public.citizen_requests
  where region_id=v_region.id
    and (v_can_manage or reporter_id=v_user);

  return jsonb_build_object(
    'region',jsonb_build_object('id',v_region.id,'slug',v_region.slug,'name',v_region.name,'short_name',v_region.short_name),
    'municipality',v_profile,
    'notices',v_notices,
    'my_requests',v_requests,
    'staff',v_staff,
    'counts',v_counts,
    'can_manage',v_can_manage,
    'is_head_admin',v_is_head
  );
end;
$function$;

create or replace function public.ec_submit_citizen_request(
  p_region_slug text,
  p_category text,
  p_title text,
  p_description text,
  p_location_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_region_id uuid;
  v_id uuid;
  v_category text := upper(coalesce(nullif(trim(p_category),''),'OTHER'));
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_user and coalesce(account_status,'ACTIVE')='ACTIVE') then
    raise exception 'Aktives Mitgliedskonto erforderlich';
  end if;

  select id into v_region_id from public.regions where slug=trim(p_region_slug) and is_active limit 1;
  if v_region_id is null then raise exception 'Region nicht gefunden'; end if;

  if v_category not in ('ROAD','LIGHTING','WASTE','PLAYGROUND','GREENSPACE','TRAFFIC','PUBLIC_SPACE','OTHER') then
    v_category := 'OTHER';
  end if;

  if char_length(btrim(coalesce(p_title,''))) < 3 then raise exception 'Titel ist zu kurz'; end if;
  if char_length(btrim(coalesce(p_description,''))) < 5 then raise exception 'Beschreibung ist zu kurz'; end if;

  if (
    select count(*) from public.citizen_requests
    where reporter_id=v_user
      and created_at >= now() - interval '24 hours'
  ) >= 15 then
    raise exception 'Zu viele Anliegen in kurzer Zeit';
  end if;

  insert into public.citizen_requests(region_id,reporter_id,category,title,description,location_text)
  values(v_region_id,v_user,v_category,left(btrim(p_title),180),left(btrim(p_description),4000),left(nullif(btrim(p_location_text),''),500))
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.ec_municipality_staff_requests(
  p_region_slug text,
  p_status text default 'OPEN'
)
returns table(
  id uuid,
  reporter_id uuid,
  reporter_nickname text,
  category text,
  title text,
  description text,
  location_text text,
  status text,
  municipality_note text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
  v_status text := upper(coalesce(nullif(trim(p_status),''),'OPEN'));
begin
  select r.id into v_region_id from public.regions r where r.slug=trim(p_region_slug) and r.is_active limit 1;
  if v_region_id is null then raise exception 'Region nicht gefunden'; end if;
  if not public.ec_municipality_can_manage(v_region_id) then raise exception 'Keine Berechtigung'; end if;

  return query
  select cr.id,cr.reporter_id,coalesce(p.nickname,p.first_name,'Mitglied')::text,
         cr.category,cr.title,cr.description,cr.location_text,cr.status,cr.municipality_note,
         cr.created_at,cr.updated_at,cr.resolved_at
  from public.citizen_requests cr
  join public.profiles p on p.id=cr.reporter_id
  where cr.region_id=v_region_id
    and (
      v_status='ALL'
      or (v_status='OPEN' and cr.status in ('NEW','REVIEWING','IN_PROGRESS'))
      or cr.status=v_status
    )
  order by
    case cr.status when 'NEW' then 1 when 'REVIEWING' then 2 when 'IN_PROGRESS' then 3 else 4 end,
    cr.updated_at desc
  limit 250;
end;
$function$;

create or replace function public.ec_municipality_update_request(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
  v_status text := upper(trim(coalesce(p_status,'')));
begin
  select region_id into v_region_id from public.citizen_requests where id=p_id;
  if v_region_id is null then return false; end if;
  if not public.ec_municipality_can_manage(v_region_id) then raise exception 'Keine Berechtigung'; end if;
  if v_status not in ('NEW','REVIEWING','IN_PROGRESS','DONE','REJECTED') then raise exception 'Ungültiger Status'; end if;

  update public.citizen_requests
  set status=v_status,
      municipality_note=left(nullif(btrim(p_note),''),3000),
      handled_by=auth.uid(),
      updated_at=now(),
      resolved_at=case when v_status in ('DONE','REJECTED') then now() else null end
  where id=p_id;

  return found;
end;
$function$;

create or replace function public.ec_municipality_save_notice(
  p_region_slug text,
  p_id uuid,
  p_title text,
  p_body text,
  p_category text default 'INFO',
  p_priority text default 'NORMAL',
  p_pinned boolean default false,
  p_published boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
  v_id uuid;
  v_category text := upper(coalesce(nullif(trim(p_category),''),'INFO'));
  v_priority text := upper(coalesce(nullif(trim(p_priority),''),'NORMAL'));
begin
  select id into v_region_id from public.regions where slug=trim(p_region_slug) and is_active limit 1;
  if v_region_id is null then raise exception 'Region nicht gefunden'; end if;
  if not public.ec_municipality_can_manage(v_region_id) then raise exception 'Keine Berechtigung'; end if;
  if v_category not in ('INFO','TRAFFIC','WATER','WASTE','EVENT','EMERGENCY','OTHER') then v_category:='INFO'; end if;
  if v_priority not in ('NORMAL','IMPORTANT','URGENT') then v_priority:='NORMAL'; end if;
  if char_length(btrim(coalesce(p_title,''))) < 3 then raise exception 'Titel ist zu kurz'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 3 then raise exception 'Text ist zu kurz'; end if;

  if p_id is null then
    insert into public.municipality_notices(region_id,title,body,category,priority,pinned,published,published_at,created_by,updated_by)
    values(v_region_id,left(btrim(p_title),180),left(btrim(p_body),5000),v_category,v_priority,coalesce(p_pinned,false),coalesce(p_published,true),case when coalesce(p_published,true) then now() else null end,auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.municipality_notices
    set title=left(btrim(p_title),180),
        body=left(btrim(p_body),5000),
        category=v_category,
        priority=v_priority,
        pinned=coalesce(p_pinned,false),
        published=coalesce(p_published,true),
        published_at=case when coalesce(p_published,true) then coalesce(published_at,now()) else null end,
        updated_by=auth.uid(),
        updated_at=now()
    where id=p_id and region_id=v_region_id
    returning id into v_id;
    if v_id is null then raise exception 'Hinweis nicht gefunden'; end if;
  end if;
  return v_id;
end;
$function$;

create or replace function public.ec_municipality_delete_notice(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
begin
  select region_id into v_region_id from public.municipality_notices where id=p_id;
  if v_region_id is null then return false; end if;
  if not public.ec_municipality_can_manage(v_region_id) then raise exception 'Keine Berechtigung'; end if;
  delete from public.municipality_notices where id=p_id;
  return found;
end;
$function$;

create or replace function public.ec_municipality_save_profile(
  p_region_slug text,
  p_official_name text,
  p_short_description text,
  p_website text default null,
  p_contact_email text default null,
  p_phone text default null,
  p_address text default null,
  p_logo_url text default null,
  p_active boolean default true,
  p_verified boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
  v_is_admin boolean := false;
  v_verified boolean;
begin
  select id into v_region_id from public.regions where slug=trim(p_region_slug) and is_active limit 1;
  if v_region_id is null then raise exception 'Region nicht gefunden'; end if;
  if not public.ec_municipality_can_own(v_region_id) then raise exception 'Keine Berechtigung'; end if;

  select exists(
    select 1 from public.profiles
    where id=auth.uid() and coalesce(account_status,'ACTIVE')='ACTIVE' and upper(role::text) in ('HEAD_ADMIN','ADMIN')
  ) into v_is_admin;

  select verified into v_verified from public.municipality_profiles where region_id=v_region_id;
  if v_verified is null then v_verified:=false; end if;
  if v_is_admin then v_verified:=coalesce(p_verified,false); end if;

  insert into public.municipality_profiles(
    region_id,official_name,short_description,website,contact_email,phone,address,logo_url,verified,active,updated_by
  ) values(
    v_region_id,left(btrim(p_official_name),180),left(coalesce(p_short_description,''),1000),
    left(nullif(btrim(p_website),''),500),left(nullif(btrim(p_contact_email),''),320),
    left(nullif(btrim(p_phone),''),100),left(nullif(btrim(p_address),''),500),
    left(nullif(btrim(p_logo_url),''),1000),v_verified,coalesce(p_active,true),auth.uid()
  )
  on conflict(region_id) do update set
    official_name=excluded.official_name,
    short_description=excluded.short_description,
    website=excluded.website,
    contact_email=excluded.contact_email,
    phone=excluded.phone,
    address=excluded.address,
    logo_url=excluded.logo_url,
    verified=v_verified,
    active=excluded.active,
    updated_by=auth.uid(),
    updated_at=now();

  return v_region_id;
end;
$function$;

create or replace function public.ec_head_set_municipality_staff(
  p_region_slug text,
  p_user_id uuid,
  p_staff_role text default 'EDITOR',
  p_active boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_region_id uuid;
  v_role text := upper(coalesce(nullif(trim(p_staff_role),''),'EDITOR'));
begin
  if not exists(
    select 1 from public.profiles
    where id=auth.uid() and coalesce(account_status,'ACTIVE')='ACTIVE' and upper(role::text)='HEAD_ADMIN'
  ) then raise exception 'Nur der Hauptadmin darf Gemeinde-Teamrechte vergeben'; end if;

  select id into v_region_id from public.regions where slug=trim(p_region_slug) and is_active limit 1;
  if v_region_id is null then raise exception 'Region nicht gefunden'; end if;
  if v_role not in ('OWNER','EDITOR') then v_role:='EDITOR'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and coalesce(account_status,'ACTIVE')='ACTIVE') then
    raise exception 'Aktives Mitglied nicht gefunden';
  end if;

  insert into public.municipality_staff(region_id,user_id,staff_role,active,assigned_by)
  values(v_region_id,p_user_id,v_role,coalesce(p_active,true),auth.uid())
  on conflict(region_id,user_id) do update set
    staff_role=excluded.staff_role,
    active=excluded.active,
    assigned_by=auth.uid(),
    updated_at=now();

  return true;
end;
$function$;

revoke all on function public.ec_municipality_can_manage(uuid) from public, anon;
revoke all on function public.ec_municipality_can_own(uuid) from public, anon;
revoke all on function public.ec_municipality_context(text) from public, anon;
revoke all on function public.ec_submit_citizen_request(text,text,text,text,text) from public, anon;
revoke all on function public.ec_municipality_staff_requests(text,text) from public, anon;
revoke all on function public.ec_municipality_update_request(uuid,text,text) from public, anon;
revoke all on function public.ec_municipality_save_notice(text,uuid,text,text,text,text,boolean,boolean) from public, anon;
revoke all on function public.ec_municipality_delete_notice(uuid) from public, anon;
revoke all on function public.ec_municipality_save_profile(text,text,text,text,text,text,text,text,boolean,boolean) from public, anon;
revoke all on function public.ec_head_set_municipality_staff(text,uuid,text,boolean) from public, anon;

grant execute on function public.ec_municipality_can_manage(uuid) to authenticated;
grant execute on function public.ec_municipality_can_own(uuid) to authenticated;
grant execute on function public.ec_municipality_context(text) to authenticated;
grant execute on function public.ec_submit_citizen_request(text,text,text,text,text) to authenticated;
grant execute on function public.ec_municipality_staff_requests(text,text) to authenticated;
grant execute on function public.ec_municipality_update_request(uuid,text,text) to authenticated;
grant execute on function public.ec_municipality_save_notice(text,uuid,text,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.ec_municipality_delete_notice(uuid) to authenticated;
grant execute on function public.ec_municipality_save_profile(text,text,text,text,text,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.ec_head_set_municipality_staff(text,uuid,text,boolean) to authenticated;
