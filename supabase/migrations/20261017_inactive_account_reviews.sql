-- Admin review for accounts inactive for at least 30 days.
create table if not exists public.inactive_account_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 inactive_since timestamptz not null,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id),
 decision text check (decision in ('IGNORE','SUSPEND')),
 unique(user_id,inactive_since)
);
create index if not exists inactive_reviews_pending_idx on public.inactive_account_reviews(created_at) where resolved_at is null;
alter table public.inactive_account_reviews enable row level security;
revoke all on public.inactive_account_reviews from anon,authenticated;
create or replace function public.ec_refresh_inactive_account_reviews()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  -- Only administrators can initiate a manual refresh; cron runs with elevated role.
  if current_user <> 'postgres' and auth.role() <> 'service_role' and not exists (
    select 1 from public.profiles p where p.id=auth.uid()
      and p.account_status='ACTIVE' and p.role::text in ('HEAD_ADMIN','ADMIN')
  ) then raise exception 'Keine Admin-Berechtigung'; end if;
  with candidate as (
    select p.id,greatest(coalesce(p.last_active_at,p.created_at),coalesce(p.last_seen_at,p.created_at),coalesce(p.last_seen,p.created_at)) activity
    from public.profiles p
    where p.account_status='ACTIVE'
      and p.role::text not in ('HEAD_ADMIN','ADMIN')
      and not coalesce(p.is_test_account,false)
      and greatest(coalesce(p.last_active_at,p.created_at),coalesce(p.last_seen_at,p.created_at),coalesce(p.last_seen,p.created_at))<=now()-interval '30 days'
  ), added as (
    insert into public.inactive_account_reviews(user_id,inactive_since)
    select c.id,c.activity from candidate c
    where not exists(select 1 from public.inactive_account_reviews r
      where r.user_id=c.id and r.inactive_since=c.activity)
    on conflict do nothing returning id,user_id
  ), alerted as (
    insert into public.notifications(user_id,title,body,type)
    select admin.id,'30 Tage inaktiv: Admin-Entscheidung',
      'Ein Mitglied ist seit mindestens 30 Tagen inaktiv. Bitte unter Admin Tools prüfen.','INACTIVE_ACCOUNT_REVIEW'
    from added a cross join public.profiles admin
    where admin.role::text in ('HEAD_ADMIN','ADMIN') and admin.account_status='ACTIVE'
    returning id
  ) select (select count(*) from added) into v_count from (select count(*) from alerted) notifications_written;
  return v_count;
end $$;
revoke all on function public.ec_refresh_inactive_account_reviews() from public,anon;
grant execute on function public.ec_refresh_inactive_account_reviews() to authenticated,service_role;

create or replace function public.ec_list_inactive_account_reviews()
returns table(id uuid,user_id uuid,display_name text,inactive_since timestamptz,days_inactive integer,points integer,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid()
   and p.account_status='ACTIVE' and p.role::text in ('HEAD_ADMIN','ADMIN'))
 then raise exception 'Keine Admin-Berechtigung'; end if;
 return query select r.id,r.user_id,coalesce(nullif(p.nickname,''),concat_ws(' ',p.first_name,p.last_name),'Mitglied'),
 r.inactive_since,floor(extract(epoch from now()-r.inactive_since)/86400)::integer,p.points,r.created_at
 from public.inactive_account_reviews r join public.profiles p on p.id=r.user_id
 where r.resolved_at is null and p.account_status='ACTIVE'
 order by r.created_at desc limit 200;
end $$;
revoke all on function public.ec_list_inactive_account_reviews() from public,anon;
grant execute on function public.ec_list_inactive_account_reviews() to authenticated;

create or replace function public.ec_decide_inactive_account_review(p_review_id uuid,p_decision text)
returns text language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_review public.inactive_account_reviews%rowtype; v_profile public.profiles%rowtype; v_last timestamptz; v_delta integer;
begin
 if p_decision not in ('IGNORE','SUSPEND') then raise exception 'Ungültige Entscheidung'; end if;
 select * into v_review from public.inactive_account_reviews where id=p_review_id for update;
 if not found or v_review.resolved_at is not null then raise exception 'Hinweis bereits erledigt'; end if;
 if not public.ec_can_profile_admin_action(v_review.user_id,'manage_members','MEMBERS',false)
 then raise exception 'Keine Berechtigung, dieses Konto zu sperren'; end if;
 select * into v_profile from public.profiles where id=v_review.user_id for update;
 if v_profile.account_status<>'ACTIVE' then raise exception 'Konto ist nicht mehr aktiv'; end if;
 v_last:=greatest(coalesce(v_profile.last_active_at,v_profile.created_at),coalesce(v_profile.last_seen_at,v_profile.created_at),coalesce(v_profile.last_seen,v_profile.created_at));
 if v_last>now()-interval '30 days' then
   update public.inactive_account_reviews set resolved_at=now(),resolved_by=auth.uid(),decision='IGNORE' where id=p_review_id;
   return 'Mitglied ist wieder aktiv – Hinweis erledigt';
 end if;
 if p_decision='SUSPEND' then
   if not public.ec_can_profile_admin_action(v_review.user_id,'manage_points',null,false)
   then raise exception 'Zusätzliches Punkterecht erforderlich'; end if;
   if public.ec_is_protected_admin_target(v_review.user_id) then raise exception 'Geschütztes Konto'; end if;
   v_delta := -10 - coalesce(v_profile.points,0);
   if v_delta<0 then
     perform public.award_member_points(v_review.user_id,v_delta,
       'Inaktivität seit mindestens 30 Tagen – manuelle Admin-Entscheidung',
       'ADMIN_ADJUSTMENT',true,'INACTIVITY_REVIEW',p_review_id);
   end if;
   -- The existing -10 trigger/score logic handles normal suspension;
   -- explicitly use the existing audited status action if the score did not cause it.
   if exists(select 1 from public.profiles where id=v_review.user_id and account_status='ACTIVE') then
     perform public.admin_set_account_status(v_review.user_id,'SUSPENDED',
       'Inaktivität seit mindestens 30 Tagen – manuelle Admin-Entscheidung');
   end if;
 end if;
 update public.inactive_account_reviews set resolved_at=now(),resolved_by=auth.uid(),decision=p_decision where id=p_review_id;
 perform public.ec_audit_insert('INACTIVITY_REVIEW','profil',v_review.user_id,v_review.user_id,
   '30 Tage Inaktivität – '||p_decision,jsonb_build_object('decision',p_decision,'review_id',p_review_id,'points_delta',case when p_decision='SUSPEND' then least(v_delta,0) else 0 end));
 return case when p_decision='IGNORE' then 'Ohne Maßnahme abgeschlossen' else 'Konto gesperrt und Punkte angepasst' end;
end $$;
revoke all on function public.ec_decide_inactive_account_review(uuid,text) from public,anon;
grant execute on function public.ec_decide_inactive_account_review(uuid,text) to authenticated;

-- Daily generation, even if no admin signs in.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('ec-inactive-account-reviews-daily','17 3 * * *',
  'select public.ec_refresh_inactive_account_reviews()');
