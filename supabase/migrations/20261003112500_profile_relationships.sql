create table if not exists public.profile_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status_type text not null,
  partner_user_id uuid null references public.profiles(id) on delete cascade,
  partner_name text null,
  confirmation_status text not null default 'NOT_REQUIRED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_relationships_status_type_check check (
    status_type in (
      'SINGLE','RELATIONSHIP','ENGAGED','MARRIED','OPEN_RELATIONSHIP',
      'COMPLICATED','SEPARATED','DIVORCED','WIDOWED'
    )
  ),
  constraint profile_relationships_confirmation_check check (
    confirmation_status in ('NOT_REQUIRED','PENDING','ACCEPTED','REJECTED')
  ),
  constraint profile_relationships_not_self check (
    partner_user_id is null or partner_user_id <> owner_id
  ),
  constraint profile_relationships_partner_name_length check (
    partner_name is null or char_length(btrim(partner_name)) between 2 and 120
  )
);

create unique index if not exists profile_relationships_unique_status_partner
  on public.profile_relationships (
    owner_id,
    status_type,
    coalesce(partner_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(lower(btrim(partner_name)), '')
  );

create index if not exists profile_relationships_owner_idx
  on public.profile_relationships(owner_id);

create index if not exists profile_relationships_partner_idx
  on public.profile_relationships(partner_user_id)
  where partner_user_id is not null;

alter table public.profile_relationships enable row level security;

drop policy if exists profile_relationships_select on public.profile_relationships;
create policy profile_relationships_select
on public.profile_relationships
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or partner_user_id = (select auth.uid())
  or confirmation_status in ('NOT_REQUIRED','ACCEPTED')
);

drop policy if exists profile_relationships_insert on public.profile_relationships;
create policy profile_relationships_insert
on public.profile_relationships
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and (
    (partner_user_id is null and confirmation_status = 'NOT_REQUIRED')
    or
    (partner_user_id is not null and partner_user_id <> (select auth.uid()) and confirmation_status = 'PENDING')
  )
);

drop policy if exists profile_relationships_delete on public.profile_relationships;
create policy profile_relationships_delete
on public.profile_relationships
for delete
to authenticated
using (owner_id = (select auth.uid()));

revoke all on table public.profile_relationships from anon;
grant select, insert, delete on table public.profile_relationships to authenticated;

create or replace function public.profile_relationship_request_normalize()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner_name text;
  v_status_label text;
begin
  new.partner_name := nullif(btrim(coalesce(new.partner_name,'')),'');
  if new.partner_user_id is not null then
    new.confirmation_status := 'PENDING';
    new.partner_name := null;
  else
    new.confirmation_status := 'NOT_REQUIRED';
  end if;
  new.updated_at := now();

  if tg_op = 'INSERT' and new.partner_user_id is not null then
    select coalesce(nullif(p.nickname,''), nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''), 'Ein Mitglied')
      into v_owner_name
    from public.profiles p
    where p.id = new.owner_id;

    v_status_label := case new.status_type
      when 'RELATIONSHIP' then 'in einer Beziehung'
      when 'ENGAGED' then 'verlobt'
      when 'MARRIED' then 'verheiratet'
      when 'OPEN_RELATIONSHIP' then 'in einer offenen Beziehung'
      when 'COMPLICATED' then 'in einer komplizierten Beziehung'
      else 'als Beziehung'
    end;

    insert into public.notifications(user_id,title,body,type)
    values (
      new.partner_user_id,
      'Beziehungsstatus bestätigen',
      v_owner_name || ' möchte dich im Profil ' || v_status_label || ' verlinken. Bitte öffne dein Profil und bestätige oder lehne die Verknüpfung ab.',
      'RELATIONSHIP_CONFIRMATION'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists profile_relationship_request_normalize_trg on public.profile_relationships;
create trigger profile_relationship_request_normalize_trg
before insert on public.profile_relationships
for each row execute function public.profile_relationship_request_normalize();

revoke all on function public.profile_relationship_request_normalize() from public, anon, authenticated;

create or replace function public.respond_profile_relationship(
  p_relationship_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profile_relationships%rowtype;
  v_partner_name text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  select *
    into v_row
  from public.profile_relationships
  where id = p_relationship_id
  for update;

  if not found then
    raise exception 'Beziehungsanfrage nicht gefunden.';
  end if;

  if v_row.partner_user_id is distinct from v_uid then
    raise exception 'Du kannst diese Beziehungsanfrage nicht bestätigen.';
  end if;

  if v_row.confirmation_status <> 'PENDING' then
    raise exception 'Diese Beziehungsanfrage wurde bereits beantwortet.';
  end if;

  v_status := case when p_accept then 'ACCEPTED' else 'REJECTED' end;

  update public.profile_relationships
  set confirmation_status = v_status,
      updated_at = now()
  where id = p_relationship_id;

  select coalesce(nullif(p.nickname,''), nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''), 'Das verlinkte Mitglied')
    into v_partner_name
  from public.profiles p
  where p.id = v_uid;

  insert into public.notifications(user_id,title,body,type)
  values (
    v_row.owner_id,
    case when p_accept then 'Beziehungsstatus bestätigt' else 'Beziehungsstatus abgelehnt' end,
    case
      when p_accept then v_partner_name || ' hat die Verknüpfung im Beziehungsstatus bestätigt.'
      else v_partner_name || ' hat die Verknüpfung im Beziehungsstatus abgelehnt.'
    end,
    case when p_accept then 'RELATIONSHIP_ACCEPTED' else 'RELATIONSHIP_REJECTED' end
  );

  return v_status;
end;
$$;

revoke all on function public.respond_profile_relationship(uuid,boolean) from public, anon;
grant execute on function public.respond_profile_relationship(uuid,boolean) to authenticated;
