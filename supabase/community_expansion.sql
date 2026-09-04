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

create table if not exists public.member_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);
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

drop function if exists public.admin_set_account_status(uuid,text);
create function public.admin_set_account_status(target_user uuid, new_status text, p_reason text)
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
