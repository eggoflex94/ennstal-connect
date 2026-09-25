create table if not exists public.forum_reply_helpful (
  reply_id uuid not null references public.forum_replies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

alter table public.forum_reply_helpful enable row level security;

revoke all on table public.forum_reply_helpful from anon;
revoke all on table public.forum_reply_helpful from authenticated;
grant select, insert, delete on table public.forum_reply_helpful to authenticated;

drop policy if exists "forum helpful visible to authenticated" on public.forum_reply_helpful;
create policy "forum helpful visible to authenticated"
on public.forum_reply_helpful
for select
to authenticated
using (true);

drop policy if exists "members can thank helpful replies" on public.forum_reply_helpful;
create policy "members can thank helpful replies"
on public.forum_reply_helpful
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.forum_replies r
    where r.id = reply_id
      and r.author_id <> (select auth.uid())
  )
);

drop policy if exists "members can remove own helpful mark" on public.forum_reply_helpful;
create policy "members can remove own helpful mark"
on public.forum_reply_helpful
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists forum_reply_helpful_reply_created_idx
  on public.forum_reply_helpful(reply_id, created_at desc);
