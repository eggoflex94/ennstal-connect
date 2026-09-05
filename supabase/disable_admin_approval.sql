-- Ennstal Connect: remove mandatory registration approval.
-- Run this file alone in Supabase SQL Editor.

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('ACTIVE','SUSPENDED'));

-- Any account that was waiting for the old approval flow becomes active.
update public.profiles set account_status='ACTIVE', suspension_reason=null
where account_status='PENDING_APPROVAL';

delete from public.registration_approval_requests where status='PENDING';

-- Auth registration must not depend on app-table constraints. The community
-- profile is safely created on first sign-in by ensure_current_profile().
create or replace function public.ec_handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  return new;
end;
$$;

create or replace function public.ensure_current_profile()
returns void language plpgsql security definer set search_path=public as $$
declare v_name text; v_first_admin boolean;
begin
  if auth.uid() is null or exists(select 1 from public.profiles where id=auth.uid()) then return; end if;
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  if exists(select 1 from public.profiles where id=auth.uid()) then return; end if;
  select coalesce(raw_user_meta_data->>'nickname',split_part(email,'@',1))
    into v_name from auth.users where id=auth.uid();
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,role,account_status)
  values(auth.uid(),v_name,case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,'ACTIVE');
end;
$$;
revoke all on function public.ensure_current_profile() from public;
grant execute on function public.ensure_current_profile() to authenticated;
notify pgrst, 'reload schema';
