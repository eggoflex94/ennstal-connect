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
declare v_first_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,first_name,last_name,birth_date,gender,role,account_status)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname',split_part(new.email,'@',1)),
    nullif(new.raw_user_meta_data->>'first_name',''),
    nullif(new.raw_user_meta_data->>'last_name',''),
    case when coalesce(new.raw_user_meta_data->>'birth_date','') ~ '^\\d{4}-\\d{2}-\\d{2}$'
         then (new.raw_user_meta_data->>'birth_date')::date else date '2000-01-01' end,
    nullif(new.raw_user_meta_data->>'gender',''),
    case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,
    'ACTIVE'
  ) on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.ensure_current_profile()
returns void language plpgsql security definer set search_path=public as $$
declare v_name text; v_first_name text; v_last_name text; v_birth_date date; v_gender text; v_first_admin boolean;
begin
  if auth.uid() is null then return; end if;
  select coalesce(raw_user_meta_data->>'nickname',split_part(email,'@',1)),
         nullif(raw_user_meta_data->>'first_name',''), nullif(raw_user_meta_data->>'last_name',''),
         case when coalesce(raw_user_meta_data->>'birth_date','') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              then (raw_user_meta_data->>'birth_date')::date else date '2000-01-01' end,
         nullif(raw_user_meta_data->>'gender','')
    into v_name,v_first_name,v_last_name,v_birth_date,v_gender from auth.users where id=auth.uid();
  -- Repair partially created profiles from older registration attempts.
  if exists(select 1 from public.profiles where id=auth.uid()) then
    update public.profiles
    set nickname=coalesce(nullif(nickname,''),v_name),
        first_name=coalesce(first_name,v_first_name), last_name=coalesce(last_name,v_last_name),
        birth_date=coalesce(birth_date,v_birth_date,date '2000-01-01'), gender=coalesce(gender,v_gender), account_status='ACTIVE'
    where id=auth.uid();
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('ennstal-connect-initial-admin'));
  if exists(select 1 from public.profiles where id=auth.uid()) then return; end if;
  select not exists(select 1 from public.profiles where role in ('ADMIN','HEAD_ADMIN')) into v_first_admin;
  insert into public.profiles(id,nickname,first_name,last_name,birth_date,gender,role,account_status)
  values(auth.uid(),v_name,v_first_name,v_last_name,coalesce(v_birth_date,date '2000-01-01'),v_gender,case when v_first_admin then 'HEAD_ADMIN' else 'MEMBER' end,'ACTIVE');
end;
$$;
revoke all on function public.ensure_current_profile() from public;
grant execute on function public.ensure_current_profile() to authenticated;

-- One-time repair: make every existing Auth account visible in the community.
-- Existing profiles are never overwritten.
insert into public.profiles(id,nickname,first_name,last_name,birth_date,gender,role,account_status)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data->>'nickname',''),split_part(u.email,'@',1)),
  nullif(u.raw_user_meta_data->>'first_name',''),
  nullif(u.raw_user_meta_data->>'last_name',''),
  case when coalesce(u.raw_user_meta_data->>'birth_date','') ~ '^\\d{4}-\\d{2}-\\d{2}$'
       then (u.raw_user_meta_data->>'birth_date')::date else date '2000-01-01' end,
  nullif(u.raw_user_meta_data->>'gender',''),
  'MEMBER',
  'ACTIVE'
from auth.users u
where not exists(select 1 from public.profiles p where p.id=u.id)
on conflict(id) do nothing;
notify pgrst, 'reload schema';
