-- Ennstal Connect: remove mandatory registration approval.
-- Run this file alone in Supabase SQL Editor.

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('ACTIVE','SUSPENDED'));

-- Any account that was waiting for the old approval flow becomes active.
update public.profiles set account_status='ACTIVE', suspension_reason=null
where account_status='PENDING_APPROVAL';

delete from public.registration_approval_requests where status='PENDING';
notify pgrst, 'reload schema';
