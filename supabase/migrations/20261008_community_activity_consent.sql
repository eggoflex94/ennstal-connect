-- Explicit, revocable consent to optional community activity emails.
create table if not exists public.community_email_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 activity_emails_enabled boolean not null,
 decided_at timestamptz not null default now()
);
alter table public.community_email_preferences enable row level security;
revoke all on public.community_email_preferences from anon;
grant select, insert, update on public.community_email_preferences to authenticated;
create policy "read own community email preference" on public.community_email_preferences
 for select to authenticated using (user_id = (select auth.uid()));
create policy "create own community email preference" on public.community_email_preferences
 for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own community email preference" on public.community_email_preferences
 for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));