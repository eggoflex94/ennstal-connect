-- Ennstal Connect: einfache Community-Aktivierung
-- Einmal allein im Supabase SQL Editor ausführen.

create table if not exists public.community_weekly_polls (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(trim(question)) between 5 and 240),
  options text[] not null check (cardinality(options) between 2 and 6),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Der Browser meldet nur echte Bedienung. Nach fünf Minuten ohne Meldung
-- zeigt die Oberfläche das Mitglied automatisch als offline an.
create or replace function public.record_presence(p_online boolean default true)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  update public.profiles
     set is_online=p_online,
         last_active_at=case when p_online then now() else last_active_at end
   where id=auth.uid();
end;
$$;

-- Profil-Aktualisierungen werden in der persönlichen Übersicht gespeichert.
-- Die Funktion ist auch dann verfügbar, wenn die Gruppen-Erweiterung nicht
-- zuvor ausgeführt wurde.
create table if not exists public.profile_activity (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (char_length(activity_type) between 3 and 120),
  created_at timestamptz not null default now()
);
alter table public.profile_activity enable row level security;
grant select, insert on public.profile_activity to authenticated;
drop policy if exists profile_activity_read on public.profile_activity;
create policy profile_activity_read on public.profile_activity for select to authenticated using (profile_id=auth.uid());
drop policy if exists profile_activity_create on public.profile_activity;
create policy profile_activity_create on public.profile_activity for insert to authenticated with check (profile_id=auth.uid() and actor_id=auth.uid());
create or replace function public.log_profile_change(p_activity text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  insert into public.profile_activity(profile_id,actor_id,activity_type)
  values(auth.uid(),auth.uid(),left(trim(coalesce(p_activity,'Profil aktualisiert')),120));
end;
$$;

-- Ein einheitlicher Bearbeitungsweg für beide Foren: Autoren dürfen immer
-- ihren eigenen Beitrag ändern; Administration beide Bereiche, Forum-Supporter
-- den öffentlichen Bereich. Die Änderung bleibt transparent nachvollziehbar.
alter table public.profiles add column if not exists forum_moderator boolean not null default false;
alter table public.forum_posts add column if not exists edited_at timestamptz;
alter table public.forum_posts add column if not exists edited_by uuid references public.profiles(id) on delete set null;
alter table public.forum_posts add column if not exists edit_reason text;
create or replace function public.forum_update_post(p_post_id uuid, p_title text, p_content text, p_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_author uuid; v_scope text; v_role text; v_forum_moderator boolean; v_owns boolean;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select author_id,scope into v_author,v_scope from public.forum_posts where id=p_post_id;
  if v_author is null then raise exception 'Beitrag nicht gefunden.'; end if;
  select role,coalesce(forum_moderator,false) into v_role,v_forum_moderator from public.profiles where id=auth.uid();
  v_owns := v_author=auth.uid();
  if not v_owns and coalesce(v_role,'MEMBER') not in ('HEAD_ADMIN','ADMIN') and not (v_scope='COMMUNITY' and v_role='SUPPORTER' and v_forum_moderator) then
    raise exception 'Keine Berechtigung zum Bearbeiten dieses Beitrags.';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 or char_length(trim(coalesce(p_content,'')))<3 then raise exception 'Überschrift und Beitrag müssen mindestens drei Zeichen enthalten.'; end if;
  if not v_owns and char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Bitte einen Bearbeitungsgrund angeben.'; end if;
  update public.forum_posts
     set title=trim(p_title),content=trim(p_content),edited_at=now(),edited_by=auth.uid(),edit_reason=case when v_owns then 'Vom Autor bearbeitet' else trim(p_reason) end
   where id=p_post_id;
end;
$$;
create table if not exists public.community_weekly_poll_votes (
  poll_id uuid not null references public.community_weekly_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists community_poll_votes_poll_idx on public.community_weekly_poll_votes(poll_id);

alter table public.community_weekly_polls enable row level security;
alter table public.community_weekly_poll_votes enable row level security;
revoke all on public.community_weekly_polls, public.community_weekly_poll_votes from anon, authenticated;

create or replace function public.weekly_poll_current()
returns table(id uuid, question text, options text[], vote_counts integer[], my_vote integer)
language sql stable security definer set search_path=public as $$
  select p.id,p.question,p.options,
    array(select count(*)::integer from unnest(p.options) with ordinality o(option_text,position)
          left join public.community_weekly_poll_votes v on v.poll_id=p.id and v.option_index=o.position-1
          group by o.position order by o.position),
    (select v.option_index from public.community_weekly_poll_votes v where v.poll_id=p.id and v.user_id=auth.uid())
  from public.community_weekly_polls p where p.is_active order by p.created_at desc limit 1;
$$;

create or replace function public.create_weekly_poll(p_question text, p_options text[])
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf Wochenfragen veröffentlichen.'; end if;
  if char_length(trim(coalesce(p_question,''))) < 5 or cardinality(p_options) not between 2 and 6 or exists(select 1 from unnest(p_options) x where char_length(trim(coalesce(x,''))) < 1) then raise exception 'Bitte Frage und zwei bis sechs Antwortmöglichkeiten angeben.'; end if;
  update public.community_weekly_polls set is_active=false where is_active;
  insert into public.community_weekly_polls(question,options,created_by) values(trim(p_question),array(select trim(x) from unnest(p_options) x),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vote_weekly_poll(p_poll_id uuid, p_option_index integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select cardinality(options) into v_count from public.community_weekly_polls where id=p_poll_id and is_active;
  if v_count is null or p_option_index not between 0 and v_count-1 then raise exception 'Ungültige Abstimmung.'; end if;
  insert into public.community_weekly_poll_votes(poll_id,user_id,option_index) values(p_poll_id,auth.uid(),p_option_index)
  on conflict(poll_id,user_id) do update set option_index=excluded.option_index,created_at=now();
end;
$$;

alter table public.community_groups add column if not exists is_featured boolean not null default false;
create or replace function public.set_featured_community_group(p_group_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf die Gruppe der Woche festlegen.'; end if;
  if p_group_id is not null and not exists(select 1 from public.community_groups where id=p_group_id) then raise exception 'Gruppe nicht gefunden.'; end if;
  update public.community_groups set is_featured=false where is_featured;
  if p_group_id is not null then update public.community_groups set is_featured=true where id=p_group_id; end if;
end;
$$;
create or replace function public.featured_community_group()
returns table(id uuid, name text, description text, image_url text, created_by uuid, owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint)
language sql stable security definer set search_path=public as $$
  select g.id,g.name,g.description,g.image_url,g.created_by,g.owner_id,g.created_at,
    coalesce(array_agg(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false)), '{}'::uuid[]),
    count(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false))
  from public.community_groups g left join public.community_group_members gm on gm.group_id=g.id left join public.profiles p on p.id=gm.user_id
  where g.is_featured group by g.id limit 1;
$$;

create or replace function public.my_welcome_badges()
returns table(key text, title text, description text, icon text, earned boolean)
language sql stable security definer set search_path=public as $$
  select * from (values
    ('WELCOME','Willkommen','Dein Konto ist bereit für die Community.','✦',true),
    ('PROFILE','Profil angelegt','Dein Name ist in der Community sichtbar.','◉',exists(select 1 from public.profiles where id=auth.uid() and coalesce(nullif(nickname,''),'') <> '')),
    ('GROUP','Erste Gruppe','Einer Community-Gruppe beigetreten','◉',exists(select 1 from public.community_group_members where user_id=auth.uid())),
    ('PHOTO','Erstes Foto','Ein Foto im Profil veröffentlicht','▣',exists(select 1 from public.member_photos where owner_id=auth.uid())),
    ('FORUM','Erster Beitrag','Im Forum mitdiskutiert','✦',exists(select 1 from public.forum_posts where author_id=auth.uid()))
  ) as badges(key,title,description,icon,earned);
$$;

create table if not exists public.community_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('MITFAHREN','WANDERPARTNER','REGIONALER_TIPP')),
  title text not null check (char_length(trim(title)) between 5 and 140),
  content text not null check (char_length(trim(content)) between 10 and 1500),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED')),
  created_at timestamptz not null default now()
);
create index if not exists community_requests_active_idx on public.community_requests(status,created_at desc);
alter table public.community_requests enable row level security;
revoke all on public.community_requests from anon, authenticated;
grant select, insert, update on public.community_requests to authenticated;
drop policy if exists community_requests_read on public.community_requests;
create policy community_requests_read on public.community_requests for select to authenticated using (status='ACTIVE' or author_id=auth.uid());
drop policy if exists community_requests_create on public.community_requests;
create policy community_requests_create on public.community_requests for insert to authenticated with check (author_id=auth.uid() and status='ACTIVE');
drop policy if exists community_requests_update on public.community_requests;
create policy community_requests_update on public.community_requests for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());

revoke all on function public.weekly_poll_current() from public;
revoke all on function public.create_weekly_poll(text,text[]) from public;
revoke all on function public.vote_weekly_poll(uuid,integer) from public;
revoke all on function public.set_featured_community_group(uuid) from public;
revoke all on function public.featured_community_group() from public;
revoke all on function public.my_welcome_badges() from public;
revoke all on function public.record_presence(boolean) from public;
revoke all on function public.log_profile_change(text) from public;
revoke all on function public.forum_update_post(uuid,text,text,text) from public;
grant execute on function public.weekly_poll_current() to authenticated;
grant execute on function public.create_weekly_poll(text,text[]) to authenticated;
grant execute on function public.vote_weekly_poll(uuid,integer) to authenticated;
grant execute on function public.set_featured_community_group(uuid) to authenticated;
grant execute on function public.featured_community_group() to authenticated;
grant execute on function public.my_welcome_badges() to authenticated;
grant execute on function public.record_presence(boolean) to authenticated;
grant execute on function public.log_profile_change(text) to authenticated;
grant execute on function public.forum_update_post(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';
