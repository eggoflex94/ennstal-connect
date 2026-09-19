-- Ennstal Connect: allow admins and business owners to feature community events.

alter table public.community_events
  add column if not exists is_featured boolean not null default false;
alter table public.community_events
  add column if not exists featured_at timestamptz;
alter table public.community_events
  add column if not exists featured_by uuid references public.profiles(id) on delete set null;
alter table public.community_events
  add column if not exists featured_color text not null default 'gold';

alter table public.community_events
  drop constraint if exists community_events_featured_color_check;
alter table public.community_events
  add constraint community_events_featured_color_check
  check (featured_color in ('gold','blue','green','red','purple','orange'));

create index if not exists community_events_featured_region_time_idx
  on public.community_events(region_id,is_featured desc,event_at asc);

drop policy if exists community_events_business_update_feature on public.community_events;
create policy community_events_business_update_feature
on public.community_events
for update
to authenticated
using (
  created_by=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.account_badge='BUSINESS'
  )
)
with check (
  created_by=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid())
      and p.account_badge='BUSINESS'
  )
);

create or replace function public.ec_guard_business_event_update()
returns trigger
language plpgsql
security invoker
set search_path=public
as $
declare
  v_role text;
  v_badge text;
begin
  if auth.uid() is null then return new; end if;

  select role,account_badge into v_role,v_badge
  from public.profiles
  where id=auth.uid();

  if v_badge='BUSINESS' and coalesce(v_role,'MEMBER') not in ('HEAD_ADMIN','ADMIN') then
    if old.created_by<>auth.uid() then
      raise exception 'Du darfst nur eigene Veranstaltungen bearbeiten.';
    end if;

    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.event_at is distinct from old.event_at
       or new.location is distinct from old.location
       or new.image_url is distinct from old.image_url
       or new.created_by is distinct from old.created_by
       or new.status is distinct from old.status
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.cancelled_at is distinct from old.cancelled_at
       or new.region_id is distinct from old.region_id
       or new.font_family is distinct from old.font_family
       or new.font_size is distinct from old.font_size
       or new.font_color is distinct from old.font_color
       or new.emphasis is distinct from old.emphasis then
      raise exception 'Unternehmenskonten dürfen hier nur die Hervorhebung ändern.';
    end if;

    if new.featured_by is distinct from old.featured_by
       and new.featured_by is distinct from auth.uid()
       and new.featured_by is not null then
      raise exception 'Ungültige Hervorhebung.';
    end if;
  end if;

  return new;
end;
$;

drop trigger if exists trg_guard_business_event_update on public.community_events;
create trigger trg_guard_business_event_update
before update on public.community_events
for each row execute function public.ec_guard_business_event_update();

create or replace function public.set_community_event_featured(
  p_event_id uuid,
  p_featured boolean,
  p_color text default 'gold'
)
returns void
language plpgsql
security invoker
set search_path=public
as $
declare
  v_user uuid := auth.uid();
  v_event public.community_events%rowtype;
  v_role text;
  v_badge text;
  v_color text := lower(coalesce(nullif(trim(p_color),''),'gold'));
begin
  if v_user is null then raise exception 'Nicht eingeloggt.'; end if;
  if v_color not in ('gold','blue','green','red','purple','orange') then
    raise exception 'Ungültige Hervorhebungsfarbe.';
  end if;

  select * into v_event
  from public.community_events
  where id=p_event_id;

  if not found then raise exception 'Veranstaltung nicht gefunden.'; end if;

  select role,account_badge into v_role,v_badge
  from public.profiles
  where id=v_user;

  if not (
    v_role in ('HEAD_ADMIN','ADMIN')
    or (v_badge='BUSINESS' and v_event.created_by=v_user)
  ) then
    raise exception 'Du darfst diese Veranstaltung nicht hervorheben.';
  end if;

  update public.community_events
  set is_featured=p_featured,
      featured_at=case when p_featured then now() else null end,
      featured_by=case when p_featured then v_user else null end,
      featured_color=case when p_featured then v_color else featured_color end
  where id=p_event_id;
end;
$;

revoke all on function public.set_community_event_featured(uuid,boolean,text) from public;
revoke all on function public.set_community_event_featured(uuid,boolean,text) from anon;
grant execute on function public.set_community_event_featured(uuid,boolean,text) to authenticated;

drop function if exists public.set_community_event_featured(uuid,boolean);

notify pgrst,'reload schema';
