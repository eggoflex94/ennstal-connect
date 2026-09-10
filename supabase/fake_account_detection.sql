-- Explainable moderation signals. No automatic suspension and no message-content inspection.
CREATE OR REPLACE FUNCTION public.head_admin_fake_account_candidates(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(user_id uuid, nickname text, first_name text, last_name text, account_status text, is_verified boolean, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed boolean, open_reports bigint, friend_requests_24h bigint, messages_24h bigint, forum_posts bigint, risk_score integer, signals text[], review_state text, review_note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'

AS $function$
begin
  if auth.uid() is null or not public.ec_is_head_admin() then
    raise exception 'Nur der aktive Head Admin darf die Fake-Account-Prüfung öffnen.' using errcode='42501';
  end if;
  return query
  with report_sources as (
    select r.reported_user_id target, r.reporter_id reporter from public.reports r
    where r.resolved_at is null and r.created_at >= now()-interval '30 days'
    union
    select r.reported_user_id, r.reporter_id from public.user_reports r
    where r.resolved_at is null and r.created_at >= now()-interval '30 days'
  ), report_counts as (
    select target, count(distinct reporter) n from report_sources
    where reporter <> target group by target
  ), contacts as (
    select f.requester_id sender, f.receiver_id receiver from public.friendships f
    where f.created_at >= now()-interval '24 hours'
    union
    select f.sender_id, f.receiver_id from public.friend_requests f
    where f.created_at >= now()-interval '24 hours'
  ), contact_counts as (
    select sender, count(distinct receiver) n from contacts where sender<>receiver group by sender
  ), message_counts as (
    select m.sender_id, count(*) n, count(distinct m.receiver_id) recipients
    from public.messages m
    where m.created_at >= now()-interval '24 hours' and m.sender_id<>m.receiver_id
      and coalesce(m.message_type,'PRIVATE') = 'PRIVATE'
    group by m.sender_id
  ), post_counts as (
    select fp.author_id, count(*) n from public.forum_posts fp group by fp.author_id
  ), base as (
    select p.id,p.nickname,p.first_name,p.last_name,p.account_status,p.created_at,
      coalesce(p.is_verified,false) verified, u.last_sign_in_at,
      u.email_confirmed_at is not null email_ok,
      coalesce(rc.n,0) reports_open,coalesce(cc.n,0) friend24,
      coalesce(mc.n,0) msg24,coalesce(mc.recipients,0) recipients,
      coalesce(pc.n,0) posts,coalesce(fr.state,'REVIEW') state,fr.note
    from public.profiles p
    left join auth.users u on u.id=p.id
    left join report_counts rc on rc.target=p.id
    left join contact_counts cc on cc.sender=p.id
    left join message_counts mc on mc.sender_id=p.id
    left join post_counts pc on pc.author_id=p.id
    left join public.fake_account_reviews fr on fr.target_user_id=p.id
    where p.role not in ('HEAD_ADMIN','ADMIN')
      and (nullif(trim(p_search),'') is null or concat_ws(' ',p.nickname,p.first_name,p.last_name) ilike '%'||left(trim(p_search),100)||'%')
  ), scored as (
    select b.*,
      (case when reports_open>=5 then 40 when reports_open>=3 then 25 else 0 end
      + case when friend24>=30 then 40 when friend24>=15 then 25 else 0 end
      + case when recipients>=40 then 50 when recipients>=20 then 35 when recipients>=10 then 20 else 0 end)::integer behavior
    from base b
  )
  select s.id,s.nickname,s.first_name,s.last_name,s.account_status,s.verified,
    s.created_at,s.last_sign_in_at,s.email_ok,s.reports_open,s.friend24,s.msg24,s.posts,
    least(100,s.behavior + case when s.behavior>0 and not s.email_ok then 5 else 0 end
      + case when s.behavior>0 and s.created_at>=now()-interval '7 days' then 5 else 0 end)::integer,
    array_remove(array[
      case when s.reports_open>=3 then s.reports_open||' unabhängige meldende Mitglieder in 30 Tagen (offene Meldungen)' end,
      case when s.friend24>=15 then s.friend24||' verschiedene Empfänger von Freundschaftsanfragen in 24 Stunden' end,
      case when s.recipients>=10 then 'Nachrichten an '||s.recipients||' verschiedene Mitglieder in 24 Stunden' end,
      case when s.behavior>0 and not s.email_ok then 'Zusatzhinweis: E-Mail noch nicht bestätigt' end,
      case when s.behavior>0 and s.created_at>=now()-interval '7 days' then 'Zusatzhinweis: Konto jünger als 7 Tage' end
    ],null)::text[],s.state,s.note
  from scored s
  order by s.behavior desc,s.created_at desc,s.id
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$function$;
REVOKE ALL ON FUNCTION public.head_admin_fake_account_candidates(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.head_admin_fake_account_candidates(text,integer) TO authenticated;
