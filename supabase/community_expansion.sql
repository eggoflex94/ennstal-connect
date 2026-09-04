-- Ennstal Connect: community expansion (photos, events, adverts, business accounts).
-- Run after member_controls.sql.

alter table public.profiles add column if not exists birthday_visible boolean not null default false;
alter table public.profiles add column if not exists last_active_at timestamptz not null default now();
alter table public.profiles add column if not exists account_badge text not null default 'STANDARD'
  check (account_badge in ('STANDARD','BUSINESS'));
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists company_description text;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_by uuid;
alter table public.profiles add column if not exists hide_online_status boolean not null default false;
alter table public.profiles add column if not exists is_test_account boolean not null default false;
alter table public.profiles add column if not exists admin_responsibilities text[] not null default '{}';

create or replace function public.admin_set_responsibilities(p_target_user uuid, p_responsibilities text[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Zuständigkeiten festlegen.'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user and role in ('ADMIN','HEAD_ADMIN')) then raise exception 'Zuständigkeiten können nur für Admin-Profile gesetzt werden.'; end if;
  update public.profiles set admin_responsibilities = coalesce(p_responsibilities, '{}') where id=p_target_user;
end;
$$;
revoke all on function public.admin_set_responsibilities(uuid,text[]) from public;
grant execute on function public.admin_set_responsibilities(uuid,text[]) to authenticated;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists verified_at timestamptz;
alter table public.profiles add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists privacy_settings jsonb not null default '{"name":"PUBLIC","birth_date":"PUBLIC","bio":"PUBLIC","location":"PUBLIC","interests":"PUBLIC","website":"PUBLIC","photos":"PUBLIC","activity":"PUBLIC"}'::jsonb;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','DECLINED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique(user_id, status)
);
alter table public.verification_requests enable row level security;
drop policy if exists verification_requests_read on public.verification_requests;
create policy verification_requests_read on public.verification_requests for select to authenticated
using (user_id = auth.uid() or public.ec_is_head_admin());
drop policy if exists verification_requests_create on public.verification_requests;
create policy verification_requests_create on public.verification_requests for insert to authenticated
with check (user_id = auth.uid() and status = 'PENDING');

create or replace function public.request_profile_verification(p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_head_admin uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_verified) then raise exception 'Dein Profil ist bereits verifiziert.'; end if;
  if exists (select 1 from public.verification_requests where user_id = auth.uid() and status = 'PENDING') then raise exception 'Deine Verifizierungsanfrage wird bereits geprüft.'; end if;
  insert into public.verification_requests(user_id, note) values (auth.uid(), left(trim(coalesce(p_note, '')), 1000));
  select id into v_head_admin from public.profiles where role = 'HEAD_ADMIN' and account_status = 'ACTIVE' limit 1;
  select coalesce(nullif(nickname, ''), 'Ein Mitglied') into v_name from public.profiles where id = auth.uid();
  if v_head_admin is not null and v_head_admin <> auth.uid() then
    insert into public.messages(sender_id, receiver_id, content, is_read, created_at)
    values (auth.uid(), v_head_admin, v_name || ' hat eine Verifizierungsanfrage gestellt.', false, now());
  end if;
end;
$$;
revoke all on function public.request_profile_verification(text) from public;
grant execute on function public.request_profile_verification(text) to authenticated;

create table if not exists public.public_profile_updates (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  nickname text not null, role text not null, account_badge text not null default 'STANDARD',
  is_verified boolean not null default false, avatar_url text, activity_type text not null,
  created_at timestamptz not null default now()
);
alter table public.public_profile_updates enable row level security;
drop policy if exists public_profile_updates_read on public.public_profile_updates;
create policy public_profile_updates_read on public.public_profile_updates for select to anon, authenticated using (true);
revoke all on public.public_profile_updates from public;
grant select on public.public_profile_updates to anon, authenticated;

create or replace function public.log_profile_change(p_activity text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select * into p from public.profiles where id = auth.uid();
  insert into public.profile_activity(profile_id, actor_id, activity_type) values (auth.uid(), auth.uid(), left(trim(p_activity), 120));
  if coalesce(p.privacy_settings->>'activity', 'PUBLIC') = 'PUBLIC' then
    insert into public.public_profile_updates(profile_id,nickname,role,account_badge,is_verified,avatar_url,activity_type)
    values (p.id,coalesce(nullif(p.nickname,''),'Mitglied'),p.role::text,p.account_badge,p.is_verified,p.avatar_url,left(trim(p_activity),120));
  end if;
end;
$$;
revoke all on function public.log_profile_change(text) from public;
grant execute on function public.log_profile_change(text) to authenticated;

create table if not exists public.member_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);
alter table public.member_photos add column if not exists visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC','FRIENDS'));
create table if not exists public.member_photo_likes (
  photo_id uuid not null references public.member_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(photo_id,user_id)
);
create table if not exists public.member_photo_comments (
  id uuid primary key default gen_random_uuid(), photo_id uuid not null references public.member_photos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade, content text not null check(char_length(trim(content)) between 1 and 600), created_at timestamptz not null default now()
);
alter table public.member_photos enable row level security;
alter table public.member_photo_likes enable row level security;
alter table public.member_photo_comments enable row level security;
drop policy if exists member_photos_read on public.member_photos;
drop policy if exists member_photos_write on public.member_photos;
drop policy if exists member_photos_delete on public.member_photos;
drop policy if exists member_photo_likes_read on public.member_photo_likes;
drop policy if exists member_photo_likes_write on public.member_photo_likes;
drop policy if exists member_photo_likes_delete on public.member_photo_likes;
drop policy if exists member_photo_comments_read on public.member_photo_comments;
drop policy if exists member_photo_comments_write on public.member_photo_comments;
drop policy if exists member_photo_comments_delete on public.member_photo_comments;
create policy member_photos_read on public.member_photos for select to authenticated using (true);
create policy member_photos_write on public.member_photos for insert to authenticated with check (owner_id=auth.uid());
drop policy if exists member_photos_update on public.member_photos;
create policy member_photos_update on public.member_photos for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid() and visibility in ('PUBLIC','FRIENDS'));
create policy member_photos_delete on public.member_photos for delete to authenticated using (owner_id=auth.uid() or public.ec_is_admin());
create policy member_photo_likes_read on public.member_photo_likes for select to authenticated using(true);
create policy member_photo_likes_write on public.member_photo_likes for insert to authenticated with check(user_id=auth.uid());
create policy member_photo_likes_delete on public.member_photo_likes for delete to authenticated using(user_id=auth.uid());
create policy member_photo_comments_read on public.member_photo_comments for select to authenticated using(true);
create policy member_photo_comments_write on public.member_photo_comments for insert to authenticated with check(author_id=auth.uid());
create policy member_photo_comments_delete on public.member_photo_comments for delete to authenticated using(author_id=auth.uid() or public.ec_is_admin());

create table if not exists public.community_events (
  id uuid primary key default gen_random_uuid(), title text not null check(char_length(trim(title)) between 3 and 160),
  description text not null default '', event_at timestamptz not null, location text, image_url text,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.community_events add column if not exists status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED'));
alter table public.community_events add column if not exists cancellation_reason text;
alter table public.community_events add column if not exists cancelled_at timestamptz;
alter table public.community_events enable row level security;
drop policy if exists community_events_read on public.community_events;
drop policy if exists community_events_admin_write on public.community_events;
create policy community_events_read on public.community_events for select to authenticated using(true);
create policy community_events_admin_write on public.community_events for all to authenticated using(public.ec_is_admin()) with check(public.ec_is_admin());

create table if not exists public.community_event_rsvps (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check(status in ('INTERESTED','GOING')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);
alter table public.community_event_rsvps enable row level security;
revoke all on public.community_event_rsvps from anon, authenticated;
grant select, insert, update on public.community_event_rsvps to authenticated;
drop policy if exists community_event_rsvps_read on public.community_event_rsvps;
drop policy if exists community_event_rsvps_write on public.community_event_rsvps;
create policy community_event_rsvps_read on public.community_event_rsvps for select to authenticated using(true);
create policy community_event_rsvps_write on public.community_event_rsvps for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.community_ads (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null default '', image_url text, link_url text,
  is_active boolean not null default true, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.community_ads enable row level security;
drop policy if exists community_ads_read on public.community_ads;
drop policy if exists community_ads_head_admin_write on public.community_ads;
create policy community_ads_read on public.community_ads for select to authenticated using(is_active or public.ec_is_head_admin());
create policy community_ads_head_admin_write on public.community_ads for all to authenticated using(public.ec_is_head_admin()) with check(public.ec_is_head_admin());

create or replace function public.admin_set_business_account(p_user_id uuid, p_enabled boolean, p_company_name text default null, p_company_description text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Unternehmenskonten verwalten.'; end if;
 update public.profiles set account_badge=case when p_enabled then 'BUSINESS' else 'STANDARD' end,
   company_name=case when p_enabled then nullif(trim(coalesce(p_company_name,'')),'') else null end,
   company_description=case when p_enabled then nullif(trim(coalesce(p_company_description,'')),'') else null end where id=p_user_id;
 if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end; $$;
revoke all on function public.admin_set_business_account(uuid,boolean,text,text) from public;
grant execute on function public.admin_set_business_account(uuid,boolean,text,text) to authenticated;

create or replace function public.admin_set_profile_verification(p_user_id uuid, p_verified boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Verifizierungen verwalten.'; end if;
  update public.profiles set is_verified=p_verified, verified_at=case when p_verified then now() else null end, verified_by=case when p_verified then auth.uid() else null end where id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end; $$;
revoke all on function public.admin_set_profile_verification(uuid,boolean) from public;
grant execute on function public.admin_set_profile_verification(uuid,boolean) to authenticated;

create or replace function public.admin_set_test_account(p_user_id uuid, p_is_test boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Testkonten verwalten.'; end if;
  if p_user_id = auth.uid() then raise exception 'Das eigene Konto kann nicht als Testkonto ausgeblendet werden.'; end if;
  if exists(select 1 from public.profiles where id=p_user_id and role='HEAD_ADMIN') then raise exception 'Der Head Admin kann nicht als Testkonto markiert werden.'; end if;
  update public.profiles set is_test_account = p_is_test where id = p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end;
$$;
revoke all on function public.admin_set_test_account(uuid,boolean) from public;
grant execute on function public.admin_set_test_account(uuid,boolean) to authenticated;

-- Reliable administrator-only edit routes.  They work even when older RLS
-- policies in an existing project do not include UPDATE or DELETE.
alter table public.news add column if not exists image_url text;
alter table public.news add column if not exists updated_at timestamptz;
create or replace function public.admin_update_news(p_news_id uuid, p_title text, p_content text, p_image_url text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Nur die Administration darf Neuigkeiten bearbeiten.'; end if;
  if char_length(trim(coalesce(p_title,''))) < 3 or char_length(trim(coalesce(p_content,''))) < 3 then raise exception 'Überschrift und Text müssen ausgefüllt sein.'; end if;
  update public.news set title=trim(p_title), content=trim(p_content), image_url=p_image_url, updated_at=now() where id=p_news_id;
  if not found then raise exception 'Neuigkeit nicht gefunden.'; end if;
end;
$$;
create or replace function public.admin_delete_news(p_news_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Nur die Administration darf Neuigkeiten löschen.'; end if;
  delete from public.news where id=p_news_id;
  if not found then raise exception 'Neuigkeit nicht gefunden.'; end if;
end;
$$;
revoke all on function public.admin_update_news(uuid,text,text,text) from public;
revoke all on function public.admin_delete_news(uuid) from public;
grant execute on function public.admin_update_news(uuid,text,text,text) to authenticated;
grant execute on function public.admin_delete_news(uuid) to authenticated;

drop function if exists public.admin_set_account_status(uuid,text);
create or replace function public.admin_set_account_status(target_user uuid, new_status text, p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor_name text;
begin
 if not public.ec_is_admin() then raise exception 'Keine Admin-Berechtigung.'; end if;
 if new_status not in ('ACTIVE','SUSPENDED') then raise exception 'Ungültiger Kontostatus.'; end if;
 if new_status='SUSPENDED' and length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Bitte einen Sperrgrund angeben.'; end if;
 if target_user = auth.uid() or exists(select 1 from public.profiles where id=target_user and role='HEAD_ADMIN') then raise exception 'Der Global Admin kann nicht gesperrt werden.'; end if;
 if exists(select 1 from public.profiles where id=target_user and role='ADMIN') and not public.ec_is_head_admin() then raise exception 'Nur der Global Admin darf Admins sperren.'; end if;
 update public.profiles set
   account_status=new_status,
   is_online=case when new_status='SUSPENDED' then false else is_online end,
   suspension_reason=case when new_status='SUSPENDED' then trim(p_reason) else null end,
   suspended_at=case when new_status='SUSPENDED' then now() else null end,
   suspended_by=case when new_status='SUSPENDED' then auth.uid() else null end
 where id=target_user;
 if not found then raise exception 'Mitglied nicht gefunden.'; end if;
 select case role when 'HEAD_ADMIN' then '♛ ' when 'ADMIN' then '★ ' else '' end || coalesce(nullif(nickname,''),'Community-Moderation') into actor_name from public.profiles where id=auth.uid();
 insert into public.messages(sender_id,receiver_id,content,is_read,created_at) values(auth.uid(),target_user,actor_name || case when new_status='SUSPENDED' then ' hat dein Konto gesperrt.' else ' hat dein Konto wieder freigegeben.' end,false,now());
end; $$;
revoke all on function public.admin_set_account_status(uuid,text,text) from public;
grant execute on function public.admin_set_account_status(uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
