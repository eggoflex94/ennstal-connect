-- Ennstal Connect: distinguish mobile and desktop presence.
-- Safe to run repeatedly in the Supabase SQL editor.

alter table public.profiles
  add column if not exists presence_device text not null default 'DESKTOP'
  check (presence_device in ('DESKTOP', 'MOBILE'));

create or replace function public.record_presence(
  p_online boolean default true,
  p_device text default 'DESKTOP'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  update public.profiles
     set is_online = p_online,
         last_active_at = case when p_online then now() else last_active_at end,
         presence_device = case
           when upper(coalesce(p_device, 'DESKTOP')) = 'MOBILE' then 'MOBILE'
           else 'DESKTOP'
         end
   where id = auth.uid();
end;
$$;

revoke all on function public.record_presence(boolean, text) from public;
revoke all on function public.record_presence(boolean, text) from anon;
grant execute on function public.record_presence(boolean, text) to authenticated;

notify pgrst, 'reload schema';
