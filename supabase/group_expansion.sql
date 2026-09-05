-- Ennstal Connect: Gruppenfunktion
-- Diese Datei EINMAL allein im Supabase SQL Editor ausführen.
-- Sie ist absichtlich unabhängig von der großen community_expansion.sql.

create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 3 and 80),
  description text not null check (char_length(trim(description)) between 10 and 3000),
  image_url text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_group_members (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.community_group_owner_change_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  proposed_owner_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists community_group_members_user_idx on public.community_group_members(user_id);
create index if not exists community_group_owner_requests_status_idx on public.community_group_owner_change_requests(status);

alter table public.community_groups enable row level security;
alter table public.community_group_members enable row level security;
alter table public.community_group_owner_change_requests enable row level security;

drop policy if exists "authenticated users read community groups" on public.community_groups;
create policy "authenticated users read community groups" on public.community_groups for select to authenticated using (true);
drop policy if exists "authenticated users read community group members" on public.community_group_members;
create policy "authenticated users read community group members" on public.community_group_members for select to authenticated using (true);

create or replace function public.ec_can_manage_community_groups(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_user and p.account_status='ACTIVE' and p.role in ('HEAD_ADMIN','ADMIN'))
      or coalesce((select up.manage_groups from public.user_permissions up where up.user_id=p_user), false);
$$;

create or replace function public.community_group_directory()
returns table(id uuid, name text, description text, image_url text, created_by uuid, owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint)
language sql stable security definer set search_path=public as $$
  select g.id,g.name,g.description,g.image_url,g.created_by,g.owner_id,g.created_at,
         coalesce(array_agg(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false)), '{}'::uuid[]) as member_ids,
         count(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false)) as member_count
  from public.community_groups g
  left join public.community_group_members gm on gm.group_id=g.id
  left join public.profiles p on p.id=gm.user_id
  group by g.id
  order by g.created_at desc;
$$;

create or replace function public.create_community_group(p_name text, p_description text, p_image_url text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='ACTIVE') then raise exception 'Nur aktive Mitglieder können Gruppen erstellen.'; end if;
  insert into public.community_groups(name,description,image_url,created_by,owner_id)
  values(trim(p_name),trim(p_description),nullif(trim(coalesce(p_image_url,'')),''),auth.uid(),auth.uid()) returning id into v_group_id;
  insert into public.community_group_members(group_id,user_id) values(v_group_id,auth.uid());
  return v_group_id;
end;
$$;

create or replace function public.join_community_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='ACTIVE') then raise exception 'Nur aktive Mitglieder können Gruppen beitreten.'; end if;
  if not exists(select 1 from public.community_groups where id=p_group_id) then raise exception 'Gruppe wurde nicht gefunden.'; end if;
  insert into public.community_group_members(group_id,user_id) values(p_group_id,auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.leave_community_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  delete from public.community_group_members where group_id=p_group_id and user_id=auth.uid();
end;
$$;

create or replace function public.update_community_group(p_group_id uuid, p_name text, p_description text, p_image_url text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists(select 1 from public.community_groups where id=p_group_id and (created_by=auth.uid() or public.ec_can_manage_community_groups())) then raise exception 'Nur der Gruppenersteller oder die Gruppenmoderation darf diese Gruppe bearbeiten.'; end if;
  update public.community_groups set name=trim(p_name),description=trim(p_description),image_url=nullif(trim(coalesce(p_image_url,'')),''),updated_at=now() where id=p_group_id;
end;
$$;

create or replace function public.request_community_group_owner_change(p_group_id uuid, p_new_owner_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists(select 1 from public.community_groups where id=p_group_id and created_by=auth.uid()) then raise exception 'Nur der Gruppenersteller kann einen Inhaberwechsel beantragen.'; end if;
  if not exists(select 1 from public.profiles where id=p_new_owner_id and account_status='ACTIVE') then raise exception 'Der neue Inhaber muss ein aktives Mitglied sein.'; end if;
  update public.community_group_owner_change_requests set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now() where group_id=p_group_id and status='PENDING';
  insert into public.community_group_owner_change_requests(group_id,requested_by,proposed_owner_id) values(p_group_id,auth.uid(),p_new_owner_id);
end;
$$;

create or replace function public.review_community_group_owner_change(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_group_id uuid; v_owner_id uuid;
begin
  if not public.ec_can_manage_community_groups() then raise exception 'Nur Gruppenmoderation oder Administration darf den Inhaberwechsel freigeben.'; end if;
  select group_id,proposed_owner_id into v_group_id,v_owner_id from public.community_group_owner_change_requests where id=p_request_id and status='PENDING' for update;
  if v_group_id is null then raise exception 'Anfrage wurde nicht gefunden oder bereits bearbeitet.'; end if;
  update public.community_group_owner_change_requests set status=case when p_approve then 'APPROVED' else 'REJECTED' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_request_id;
  if p_approve then
    update public.community_groups set owner_id=v_owner_id,updated_at=now() where id=v_group_id;
    insert into public.community_group_members(group_id,user_id) values(v_group_id,v_owner_id) on conflict do nothing;
  end if;
end;
$$;

create or replace function public.community_group_owner_change_queue()
returns table(id uuid, group_id uuid, group_name text, requested_by uuid, proposed_owner_id uuid, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.id,r.group_id,g.name,r.requested_by,r.proposed_owner_id,r.created_at
  from public.community_group_owner_change_requests r
  join public.community_groups g on g.id=r.group_id
  where r.status='PENDING' and public.ec_can_manage_community_groups()
  order by r.created_at asc;
$$;

-- Either participant may remove a conversation item. This keeps the inbox
-- small without permitting unrelated members to delete messages.
create or replace function public.delete_private_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  delete from public.messages
  where id=p_message_id and (sender_id=auth.uid() or receiver_id=auth.uid());
  if not found then raise exception 'Nachricht wurde nicht gefunden oder darf nicht gelöscht werden.'; end if;
end;
$$;

revoke all on function public.ec_can_manage_community_groups(uuid) from public;
revoke all on function public.community_group_directory() from public;
revoke all on function public.create_community_group(text,text,text) from public;
revoke all on function public.join_community_group(uuid) from public;
revoke all on function public.leave_community_group(uuid) from public;
revoke all on function public.update_community_group(uuid,text,text,text) from public;
revoke all on function public.request_community_group_owner_change(uuid,uuid) from public;
revoke all on function public.review_community_group_owner_change(uuid,boolean) from public;
revoke all on function public.community_group_owner_change_queue() from public;
revoke all on function public.delete_private_message(uuid) from public;
grant execute on function public.community_group_directory() to authenticated;
grant execute on function public.create_community_group(text,text,text) to authenticated;
grant execute on function public.join_community_group(uuid) to authenticated;
grant execute on function public.leave_community_group(uuid) to authenticated;
grant execute on function public.update_community_group(uuid,text,text,text) to authenticated;
grant execute on function public.request_community_group_owner_change(uuid,uuid) to authenticated;
grant execute on function public.review_community_group_owner_change(uuid,boolean) to authenticated;
grant execute on function public.community_group_owner_change_queue() to authenticated;
grant execute on function public.delete_private_message(uuid) to authenticated;
notify pgrst, 'reload schema';
