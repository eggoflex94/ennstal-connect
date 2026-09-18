-- Ennstal Connect: member poke feature with notification and per-pair counting.

create table if not exists public.member_pokes (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create index if not exists member_pokes_sender_receiver_created_idx
  on public.member_pokes(sender_id, receiver_id, created_at desc);
create index if not exists member_pokes_receiver_created_idx
  on public.member_pokes(receiver_id, created_at desc);

alter table public.member_pokes enable row level security;
grant select, insert on public.member_pokes to authenticated;

drop policy if exists member_pokes_read on public.member_pokes;
create policy member_pokes_read
on public.member_pokes
for select
to authenticated
using (
  sender_id = (select auth.uid())
  or receiver_id = (select auth.uid())
);

drop policy if exists member_pokes_insert on public.member_pokes;
create policy member_pokes_insert
on public.member_pokes
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and receiver_id <> (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = receiver_id
      and coalesce(p.account_status, 'ACTIVE') = 'ACTIVE'
  )
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = receiver_id)
       or (b.blocker_id = receiver_id and b.blocked_id = (select auth.uid()))
  )
);

create or replace function public.ec_guard_member_poke()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.member_pokes p
    where p.sender_id = new.sender_id
      and p.receiver_id = new.receiver_id
      and p.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Du kannst dieselbe Person nur alle 30 Minuten anstupsen.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_member_poke on public.member_pokes;
create trigger trg_guard_member_poke
before insert on public.member_pokes
for each row execute function public.ec_guard_member_poke();

create or replace function public.ec_notify_member_poke()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_count bigint;
begin
  select coalesce(
      nullif(trim(p.nickname), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Ein Mitglied'
    )
    into v_name
  from public.profiles p
  where p.id = new.sender_id;

  select count(*)
    into v_count
  from public.member_pokes p
  where p.sender_id = new.sender_id
    and p.receiver_id = new.receiver_id;

  insert into public.notifications(user_id, title, body, type)
  values (
    new.receiver_id,
    'Du wurdest angestupst 👋',
    v_name || ' hat dich angestupst. Insgesamt schon ' || v_count || '×.',
    'POKE'
  );

  return new;
end;
$$;

revoke all on function public.ec_notify_member_poke() from public;
revoke all on function public.ec_notify_member_poke() from anon;
revoke all on function public.ec_notify_member_poke() from authenticated;

drop trigger if exists trg_notify_member_poke on public.member_pokes;
create trigger trg_notify_member_poke
after insert on public.member_pokes
for each row execute function public.ec_notify_member_poke();

notify pgrst, 'reload schema';
