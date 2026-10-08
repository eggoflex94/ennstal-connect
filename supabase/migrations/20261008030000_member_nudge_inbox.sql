-- Modern nudge inbox for direct reply actions.
-- Existing member_nudge stays unchanged; this only exposes received nudges with sender profile data.

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
  select
    n.sender_id,
    coalesce(nullif(trim(p.nickname),''), nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''), 'Mitglied') as nickname,
    p.avatar_url,
    n.nudge_count,
    n.last_nudged_at
  from public.member_nudges n
  join public.profiles p on p.id = n.sender_id
  where n.recipient_id = auth.uid()
    and coalesce(p.account_status,'ACTIVE') = 'ACTIVE'
    and coalesce(p.is_suspended,false) = false
  order by n.last_nudged_at desc
  limit 30;
$$;

revoke all on function public.member_nudge_inbox() from public, anon;
grant execute on function public.member_nudge_inbox() to authenticated;
