-- Community Photographer + event photo galleries
alter table public.profiles
  add column if not exists is_community_photographer boolean not null default false,
  add column if not exists community_photographer_global boolean not null default false,
  add column if not exists community_photographer_region_ids uuid[] not null default '{}'::uuid[];

alter table public.user_permissions
  add column if not exists manage_community_photographers boolean not null default false;

create table if not exists public.community_photographer_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('GLOBAL','REGIONAL')),
  region_id uuid references public.regions(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  check ((scope='GLOBAL' and region_id is null) or (scope='REGIONAL' and region_id is not null))
);
create unique index if not exists community_photographer_global_unique
  on public.community_photographer_assignments(user_id) where scope='GLOBAL';
create unique index if not exists community_photographer_region_unique
  on public.community_photographer_assignments(user_id,region_id) where scope='REGIONAL';

create table if not exists public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.community_events(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','HIDDEN')),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_photos_event_created_idx on public.event_photos(event_id,created_at desc);
create index if not exists event_photos_uploader_idx on public.event_photos(uploaded_by,created_at desc);

create table if not exists public.event_photo_likes (
  photo_id uuid not null references public.event_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(photo_id,user_id)
);

create table if not exists public.event_photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.event_photos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_photo_comments_photo_idx on public.event_photo_comments(photo_id,created_at);

create table if not exists public.event_photo_reports (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.event_photos(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'PENDING' check (status in ('PENDING','RESOLVED','REJECTED')),
  created_at timestamptz not null default now(),
  unique(photo_id,reporter_id)
);

create or replace function public.can_manage_community_photographers()
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select exists(
    select 1 from public.profiles p
    left join public.user_permissions up on up.user_id=p.id
    where p.id=auth.uid() and p.account_status='ACTIVE'
      and (upper(p.role::text)='HEAD_ADMIN' or (upper(p.role::text)='ADMIN' and coalesce(up.manage_community_photographers,false)))
  );
$$;
revoke all on function public.can_manage_community_photographers() from public, anon;
grant execute on function public.can_manage_community_photographers() to authenticated;

create or replace function public.can_upload_event_photo(p_event_id uuid)
returns boolean language sql stable security definer set search_path='public','pg_temp' as $$
  select exists(
    select 1 from public.community_events e
    join public.profiles p on p.id=auth.uid() and p.account_status='ACTIVE'
    where e.id=p_event_id and coalesce(e.status,'ACTIVE') <> 'CANCELLED'
      and (
        upper(p.role::text)='HEAD_ADMIN'
        or exists(
          select 1 from public.community_photographer_assignments a
          where a.user_id=p.id and a.active=true
            and (a.scope='GLOBAL' or (a.scope='REGIONAL' and a.region_id=e.region_id))
        )
      )
  );
$$;
revoke all on function public.can_upload_event_photo(uuid) from public, anon;
grant execute on function public.can_upload_event_photo(uuid) to authenticated;

create or replace function public.ec_sync_community_photographer_profile(p_user uuid)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_global boolean; v_regions uuid[];
begin
  select exists(select 1 from public.community_photographer_assignments where user_id=p_user and active=true and scope='GLOBAL') into v_global;
  select coalesce(array_agg(region_id order by region_id) filter (where region_id is not null),'{}'::uuid[])
  into v_regions
  from public.community_photographer_assignments
  where user_id=p_user and active=true and scope='REGIONAL';
  update public.profiles
  set is_community_photographer=v_global or cardinality(v_regions)>0,
      community_photographer_global=v_global,
      community_photographer_region_ids=v_regions,
      updated_at=now()
  where id=p_user;
end;
$$;
revoke all on function public.ec_sync_community_photographer_profile(uuid) from public, anon, authenticated;

create or replace function public.ec_community_photographer_assignment_sync()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
begin
  perform public.ec_sync_community_photographer_profile(coalesce(new.user_id,old.user_id));
  if tg_op='UPDATE' and new.user_id is distinct from old.user_id then
    perform public.ec_sync_community_photographer_profile(old.user_id);
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function public.ec_community_photographer_assignment_sync() from public, anon, authenticated;
drop trigger if exists ec_community_photographer_assignment_sync on public.community_photographer_assignments;
create trigger ec_community_photographer_assignment_sync
after insert or update or delete on public.community_photographer_assignments
for each row execute function public.ec_community_photographer_assignment_sync();

create or replace function public.set_community_photographer_assignment(
  p_target_user uuid,p_scope text,p_region_id uuid default null,p_enabled boolean default true
)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_scope text:=upper(btrim(coalesce(p_scope,'')));
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if not public.can_manage_community_photographers() then raise exception 'Keine Berechtigung, Community-Fotografen zu verwalten.'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user and account_status='ACTIVE') then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
  if v_scope not in ('GLOBAL','REGIONAL') then raise exception 'Ungültiger Geltungsbereich.'; end if;
  if v_scope='REGIONAL' and (p_region_id is null or not exists(select 1 from public.regions where id=p_region_id and is_active=true)) then raise exception 'Bitte eine gültige Region auswählen.'; end if;
  if p_enabled then
    if v_scope='GLOBAL' then
      insert into public.community_photographer_assignments(user_id,scope,region_id,assigned_by,active)
      values(p_target_user,'GLOBAL',null,auth.uid(),true)
      on conflict (user_id) where scope='GLOBAL'
      do update set active=true,assigned_by=excluded.assigned_by,created_at=now();
    else
      insert into public.community_photographer_assignments(user_id,scope,region_id,assigned_by,active)
      values(p_target_user,'REGIONAL',p_region_id,auth.uid(),true)
      on conflict (user_id,region_id) where scope='REGIONAL'
      do update set active=true,assigned_by=excluded.assigned_by,created_at=now();
    end if;
  else
    if v_scope='GLOBAL' then
      delete from public.community_photographer_assignments where user_id=p_target_user and scope='GLOBAL';
    else
      delete from public.community_photographer_assignments where user_id=p_target_user and scope='REGIONAL' and region_id=p_region_id;
    end if;
  end if;
  perform public.ec_sync_community_photographer_profile(p_target_user);
  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),case when p_enabled then 'COMMUNITY_PHOTOGRAPHER_ASSIGNED' else 'COMMUNITY_PHOTOGRAPHER_REMOVED' end,'PROFILE',p_target_user,jsonb_build_object('scope',v_scope,'region_id',p_region_id,'enabled',p_enabled));
end;
$$;
revoke all on function public.set_community_photographer_assignment(uuid,text,uuid,boolean) from public, anon;
grant execute on function public.set_community_photographer_assignment(uuid,text,uuid,boolean) to authenticated;

create or replace function public.head_admin_set_photographer_manager(p_target_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='public','pg_temp' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='ACTIVE' and upper(role::text)='HEAD_ADMIN') then raise exception 'Nur der Hauptadmin darf dieses Zusatzrecht vergeben.'; end if;
  if not exists(select 1 from public.profiles where id=p_target_user and account_status='ACTIVE' and upper(role::text)='ADMIN') then raise exception 'Das Zusatzrecht kann nur einem Global Admin gegeben werden.'; end if;
  insert into public.user_permissions(user_id,manage_community_photographers,updated_at)
  values(p_target_user,p_enabled,now())
  on conflict(user_id) do update set manage_community_photographers=excluded.manage_community_photographers,updated_at=now();
  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(auth.uid(),case when p_enabled then 'PHOTOGRAPHER_MANAGER_GRANTED' else 'PHOTOGRAPHER_MANAGER_REVOKED' end,'PROFILE',p_target_user,jsonb_build_object('enabled',p_enabled));
end;
$$;
revoke all on function public.head_admin_set_photographer_manager(uuid,boolean) from public, anon;
grant execute on function public.head_admin_set_photographer_manager(uuid,boolean) to authenticated;

create or replace function public.create_event_photo(p_event_id uuid,p_storage_path text,p_caption text default null)
returns uuid language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_id uuid; v_uid uuid:=auth.uid(); v_path text:=btrim(coalesce(p_storage_path,''));
begin
  if v_uid is null then raise exception 'Nicht angemeldet.'; end if;
  if not public.can_upload_event_photo(p_event_id) then raise exception 'Für dieses Event hast du keine Foto-Berechtigung.'; end if;
  if v_path not like v_uid::text||'/'||p_event_id::text||'/%' then raise exception 'Ungültiger Speicherpfad.'; end if;
  if v_path !~* '\.(webp|jpe?g)$' then raise exception 'Nur optimierte JPG- oder WebP-Bilder sind erlaubt.'; end if;
  if char_length(coalesce(p_caption,''))>240 then raise exception 'Bildbeschreibung ist zu lang.'; end if;
  insert into public.event_photos(event_id,uploaded_by,storage_path,caption)
  values(p_event_id,v_uid,v_path,nullif(btrim(coalesce(p_caption,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.create_event_photo(uuid,text,text) from public, anon;
grant execute on function public.create_event_photo(uuid,text,text) to authenticated;

create or replace function public.ec_event_photo_counts()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
begin
  if tg_table_name='event_photo_likes' then
    update public.event_photos set like_count=(select count(*) from public.event_photo_likes where photo_id=coalesce(new.photo_id,old.photo_id)) where id=coalesce(new.photo_id,old.photo_id);
  else
    update public.event_photos set comment_count=(select count(*) from public.event_photo_comments where photo_id=coalesce(new.photo_id,old.photo_id)) where id=coalesce(new.photo_id,old.photo_id);
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function public.ec_event_photo_counts() from public, anon, authenticated;
drop trigger if exists event_photo_like_count_sync on public.event_photo_likes;
create trigger event_photo_like_count_sync after insert or delete on public.event_photo_likes for each row execute function public.ec_event_photo_counts();
drop trigger if exists event_photo_comment_count_sync on public.event_photo_comments;
create trigger event_photo_comment_count_sync after insert or delete on public.event_photo_comments for each row execute function public.ec_event_photo_counts();

create or replace function public.ec_event_photo_points()
returns trigger language plpgsql security definer set search_path='public','pg_temp' as $$
declare v_today_count integer; v_awarded boolean;
begin
  if tg_op='INSERT' then
    select count(*) into v_today_count from public.event_photos where uploaded_by=new.uploaded_by and created_at::date=current_date;
    if v_today_count<=20 then
      insert into public.point_transactions(member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated)
      values(new.uploaded_by,null,'PLUS'::public.point_kind,2,'Eventfoto veröffentlicht','EVENT_PHOTO','EVENT_PHOTO',new.id,true);
    end if;
    return new;
  end if;
  select exists(select 1 from public.point_transactions where source_type='EVENT_PHOTO' and source_id=old.id and amount>0) into v_awarded;
  if v_awarded then
    insert into public.point_transactions(member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated)
    values(old.uploaded_by,null,'MINUS'::public.point_kind,-2,'Eventfoto gelöscht – Punkte zurückgenommen','EVENT_PHOTO','EVENT_PHOTO_DELETE',old.id,true);
  end if;
  return old;
end;
$$;
revoke all on function public.ec_event_photo_points() from public, anon, authenticated;
drop trigger if exists event_photo_points on public.event_photos;
create trigger event_photo_points after insert or delete on public.event_photos for each row execute function public.ec_event_photo_points();

alter table public.community_photographer_assignments enable row level security;
alter table public.event_photos enable row level security;
alter table public.event_photo_likes enable row level security;
alter table public.event_photo_comments enable row level security;
alter table public.event_photo_reports enable row level security;

drop policy if exists "photographer assignments visible to members" on public.community_photographer_assignments;
create policy "photographer assignments visible to members" on public.community_photographer_assignments for select to authenticated using (true);
drop policy if exists "event photos visible to members" on public.event_photos;
create policy "event photos visible to members" on public.event_photos for select to authenticated using (status='PUBLISHED' or uploaded_by=(select auth.uid()));
drop policy if exists "photographers update own event photos" on public.event_photos;
create policy "photographers update own event photos" on public.event_photos for update to authenticated using (uploaded_by=(select auth.uid()) and public.can_upload_event_photo(event_id)) with check (uploaded_by=(select auth.uid()) and public.can_upload_event_photo(event_id));
drop policy if exists "photographers delete own event photos" on public.event_photos;
create policy "photographers delete own event photos" on public.event_photos for delete to authenticated using (uploaded_by=(select auth.uid()) and public.can_upload_event_photo(event_id));

drop policy if exists "likes visible to members" on public.event_photo_likes;
create policy "likes visible to members" on public.event_photo_likes for select to authenticated using (exists(select 1 from public.event_photos p where p.id=photo_id and (p.status='PUBLISHED' or p.uploaded_by=(select auth.uid()))));
drop policy if exists "members like event photos" on public.event_photo_likes;
create policy "members like event photos" on public.event_photo_likes for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.event_photos p where p.id=photo_id and p.status='PUBLISHED'));
drop policy if exists "members remove own event photo likes" on public.event_photo_likes;
create policy "members remove own event photo likes" on public.event_photo_likes for delete to authenticated using (user_id=(select auth.uid()));

drop policy if exists "comments visible to members" on public.event_photo_comments;
create policy "comments visible to members" on public.event_photo_comments for select to authenticated using (exists(select 1 from public.event_photos p where p.id=photo_id and (p.status='PUBLISHED' or p.uploaded_by=(select auth.uid()))));
drop policy if exists "members comment on event photos" on public.event_photo_comments;
create policy "members comment on event photos" on public.event_photo_comments for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.event_photos p where p.id=photo_id and p.status='PUBLISHED'));
drop policy if exists "members edit own event photo comments" on public.event_photo_comments;
create policy "members edit own event photo comments" on public.event_photo_comments for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists "members delete own event photo comments" on public.event_photo_comments;
create policy "members delete own event photo comments" on public.event_photo_comments for delete to authenticated using (user_id=(select auth.uid()));

drop policy if exists "members report event photos" on public.event_photo_reports;
create policy "members report event photos" on public.event_photo_reports for insert to authenticated with check (reporter_id=(select auth.uid()) and exists(select 1 from public.event_photos p where p.id=photo_id and p.status='PUBLISHED'));
drop policy if exists "admins view event photo reports" on public.event_photo_reports;
create policy "admins view event photo reports" on public.event_photo_reports for select to authenticated using (exists(select 1 from public.profiles p left join public.user_permissions up on up.user_id=p.id where p.id=(select auth.uid()) and p.account_status='ACTIVE' and (upper(p.role::text)='HEAD_ADMIN' or (upper(p.role::text)='ADMIN' and coalesce(up.manage_reports,false)))));

grant select on public.community_photographer_assignments to authenticated;
grant select,update,delete on public.event_photos to authenticated;
revoke insert on public.event_photos from authenticated, anon;
grant select,insert,delete on public.event_photo_likes to authenticated;
grant select,insert,update,delete on public.event_photo_comments to authenticated;
grant insert,select on public.event_photo_reports to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('event-photos','event-photos',true,6291456,array['image/webp','image/jpeg'])
on conflict(id) do update
set public=true,file_size_limit=6291456,allowed_mime_types=array['image/webp','image/jpeg'];

drop policy if exists "event photographers upload optimized photos" on storage.objects;
create policy "event photographers upload optimized photos" on storage.objects for insert to authenticated with check (bucket_id='event-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.can_upload_event_photo(((storage.foldername(name))[2])::uuid));
drop policy if exists "event photographers update own optimized photos" on storage.objects;
create policy "event photographers update own optimized photos" on storage.objects for update to authenticated using (bucket_id='event-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.can_upload_event_photo(((storage.foldername(name))[2])::uuid)) with check (bucket_id='event-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.can_upload_event_photo(((storage.foldername(name))[2])::uuid));
drop policy if exists "event photographers delete own optimized photos" on storage.objects;
create policy "event photographers delete own optimized photos" on storage.objects for delete to authenticated using (bucket_id='event-photos' and (storage.foldername(name))[1]=(select auth.uid())::text and public.can_upload_event_photo(((storage.foldername(name))[2])::uuid));