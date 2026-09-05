-- Ennstal Connect: remove mandatory registration approval.
-- Run this file alone in Supabase SQL Editor.

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('ACTIVE','SUSPENDED'));

-- Any account that was waiting for the old approval flow becomes active.
update public.profiles set account_status='ACTIVE', suspension_reason=null
where account_status='PENDING_APPROVAL';

delete from public.registration_approval_requests where status='PENDING';

-- New registrations are immediately active. Fake-account checks are handled
-- later by the existing verification-request tools for admins.
create or replace function public.ec_handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_first_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  v_name := coalesce(new.raw_user_meta_data->>'nickname',split_part(new.email,'@',1));
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,role,account_status)
  values(new.id,v_name,case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,'ACTIVE')
  on conflict(id) do nothing;
  return new;
end;
$$;
notify pgrst, 'reload schema';
