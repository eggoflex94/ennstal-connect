-- Ennstal Connect: registration and admin-approval repair.
-- Run this file alone in Supabase SQL Editor. Do not run a second SQL tab at
-- the same time.

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('ACTIVE','PENDING_APPROVAL','SUSPENDED'));

create table if not exists public.registration_approval_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED')),
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id), reason text
);
alter table public.registration_approval_requests enable row level security;

-- Create only the minimal review record in the Auth step. Optional messages
-- are deliberately sent later, so they can never block registration.
create or replace function public.ec_handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_first_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  v_name := coalesce(new.raw_user_meta_data->>'nickname',split_part(new.email,'@',1));
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,role,account_status)
  values(new.id,v_name,case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,
         case when v_first_admin then 'ACTIVE' else 'PENDING_APPROVAL' end)
  on conflict(id) do nothing;
  if not v_first_admin then
    insert into public.registration_approval_requests(user_id) values(new.id)
    on conflict(user_id) do nothing;
  end if;
  return new;
end;
$$;

-- Old project versions may have registered a differently named trigger on
-- auth.users. Remove only custom triggers; Supabase internal triggers remain.
do $$
declare t record;
begin
  for t in select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal loop
    execute format('drop trigger if exists %I on auth.users', t.tgname);
  end loop;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.ec_handle_new_user();

-- The profile and approval request are created safely at the first login.
create or replace function public.ensure_current_profile()
returns void language plpgsql security definer set search_path=public as $$
declare v_name text; v_email text; v_first_admin boolean; a record;
begin
  if auth.uid() is null or exists(select 1 from public.profiles where id=auth.uid()) then return; end if;
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  if exists(select 1 from public.profiles where id=auth.uid()) then return; end if;
  select email, coalesce(raw_user_meta_data->>'nickname',split_part(email,'@',1))
    into v_email,v_name from auth.users where id=auth.uid();
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,role,account_status)
  values(auth.uid(),v_name,case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,
         case when v_first_admin then 'ACTIVE' else 'PENDING_APPROVAL' end);
  if not v_first_admin then
    insert into public.registration_approval_requests(user_id) values(auth.uid()) on conflict(user_id) do nothing;
    for a in select id from public.profiles where role in ('ADMIN','HEAD_ADMIN') and account_status='ACTIVE' loop
      begin
        insert into public.messages(sender_id,receiver_id,content,is_read,created_at)
        values(auth.uid(),a.id,'Neue Registrierung wartet auf Freigabe: ' || v_name || ' (' || v_email || ')',false,now());
      exception when others then null;
      end;
    end loop;
  end if;
end;
$$;

create or replace function public.admin_review_registration(p_user_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  if not p_approve and char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Bitte einen Ablehnungsgrund angeben.'; end if;
  update public.registration_approval_requests
  set status=case when p_approve then 'APPROVED' else 'DECLINED' end,
      reviewed_at=now(), reviewed_by=auth.uid(), reason=case when p_approve then null else trim(p_reason) end
  where user_id=p_user_id and status='PENDING';
  if not found then raise exception 'Keine offene Registrierungsanfrage gefunden.'; end if;
  update public.profiles
  set account_status=case when p_approve then 'ACTIVE' else 'SUSPENDED' end,
      suspension_reason=case when p_approve then null else trim(p_reason) end
  where id=p_user_id;
end;
$$;
revoke all on function public.admin_review_registration(uuid,boolean,text) from public;
grant execute on function public.admin_review_registration(uuid,boolean,text) to authenticated;

create or replace function public.admin_registration_approval_queue()
returns table(user_id uuid, nickname text, email text, registered_at timestamptz, review_reason text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  return query select r.user_id, coalesce(nullif(p.nickname,''),'Mitglied'), u.email::text, r.created_at,
    'Registrierung wartet auf Freigabe'
  from public.registration_approval_requests r
  join public.profiles p on p.id=r.user_id join auth.users u on u.id=r.user_id
  where r.status='PENDING' order by r.created_at;
end;
$$;
revoke all on function public.admin_registration_approval_queue() from public;
grant execute on function public.admin_registration_approval_queue() to authenticated;

-- Use this only once for an account created by an older trigger before this
-- repair was installed. It moves that account into the normal review queue.
create or replace function public.admin_queue_existing_registration(p_email text)
returns void language plpgsql security definer set search_path=public as $$
declare v_user_id uuid;
begin
  if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
  select id into v_user_id from auth.users where lower(email)=lower(trim(p_email));
  if v_user_id is null then raise exception 'Kein Konto mit dieser E-Mail gefunden.'; end if;
  if exists(select 1 from public.profiles where id=v_user_id and role='HEAD_ADMIN') then raise exception 'Der Head Admin kann nicht in die Freigabe verschoben werden.'; end if;
  update public.profiles set account_status='PENDING_APPROVAL' where id=v_user_id;
  insert into public.registration_approval_requests(user_id) values(v_user_id)
  on conflict(user_id) do update set status='PENDING', reviewed_at=null, reviewed_by=null, reason=null;
end;
$$;
revoke all on function public.admin_queue_existing_registration(text) from public;
grant execute on function public.admin_queue_existing_registration(text) to authenticated;

notify pgrst, 'reload schema';
