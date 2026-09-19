-- Ennstal Connect: allow admins and business owners to feature community events.

alter table public.community_events
  add column if not exists is_featured boolean not null default false;
alter table public.community_events
  add column if not exists featured_at timestamptz;
alter table public.community_events
  add column if not exists featured_by uuid references public.profiles(id) on delete set null;

create index if not exists community_events_featured_region_time_idx
  on public.community_events(region_id,is_featured desc,event_at asc);

create or replace function public.set_community_event_featured(
  p_event_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_event public.community_events%rowtype;
  v_role text;
  v_badge text;
begin
  if v_user is null then raise exception 'Nicht eingeloggt.'; end if;

  select * into v_event
  from public.community_events
  where id=p_event_id
  for update;

  if not found then raise exception 'Veranstaltung nicht gefunden.'; end if;

  select role,account_badge into v_role,v_badge
  from public.profiles
  where id=v_user;

  if not (
    v_role in ('HEAD_ADMIN','ADMIN')
    or (
      v_badge='BUSINESS'
      and v_event.created_by=v_user
    )
  ) then
    raise exception 'Du darfst diese Veranstaltung nicht hervorheben.';
  end if;

  update public.community_events
  set is_featured=p_featured,
      featured_at=case when p_featured then now() else null end,
      featured_by=case when p_featured then v_user else null end
  where id=p_event_id;
end;
$$;

revoke all on function public.set_community_event_featured(uuid,boolean) from public;
revoke all on function public.set_community_event_featured(uuid,boolean) from anon;
grant execute on function public.set_community_event_featured(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
