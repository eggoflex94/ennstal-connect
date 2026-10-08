-- Merge legacy POKE and current NUDGE records into one complete inbox.

create or replace function public.member_nudge_inbox()
returns table(
  sender_id uuid,
  nickname text,
  avatar_url text,
  nudge_count integer,
  last_nudged_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with combined as (
    select
      n.sender_id,
      n.nudge_count::bigint as event_count,
      n.last_nudged_at as event_at
    from public.member_nudges n
    where n.recipient_id = auth.uid()

    union all

    select
      p.sender_id,
      1::bigint as event_count,
      p.created_at as event_at
    from public.member_pokes p
    where p.receiver_id = auth.uid()
  ),
  grouped as (
    select
      c.sender_id,
      sum(c.event_count)::integer as nudge_count,
      max(c.event_at) as last_nudged_at
    from combined c
    group by c.sender_id
  )
  select
    g.sender_id,
    coalesce(
      nullif(trim(p.nickname),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Mitglied'
    ) as nickname,
    p.avatar_url,
    g.nudge_count,
    g.last_nudged_at
  from grouped g
  join public.profiles p on p.id = g.sender_id
  where coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
    and coalesce(p.is_suspended,false) = false
  order by g.last_nudged_at desc
  limit 100;
$$;

revoke all on function public.member_nudge_inbox() from public, anon;
grant execute on function public.member_nudge_inbox() to authenticated;
