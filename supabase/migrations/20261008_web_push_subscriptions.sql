-- Consent-based push endpoints: only their owners can register, inspect, or delete.
create table if not exists public.web_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth text not null,
 created_at timestamptz not null default now(),
 constraint push_endpoint_https check (endpoint like 'https://%')
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions(user_id);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from anon;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
create policy "Owner reads push subscription" on public.web_push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner adds push subscription" on public.web_push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owner updates push subscription" on public.web_push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner removes push subscription" on public.web_push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));