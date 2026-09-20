create table if not exists private.app_error_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  error_type text not null,
  severity text not null default 'ERROR',
  title text not null,
  message text not null,
  path text,
  source text,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count bigint not null default 1,
  last_user_id uuid,
  status text not null default 'OPEN',
  resolved_at timestamptz,
  resolved_by uuid,
  last_notified_at timestamptz,
  constraint app_error_events_severity_check check (severity in ('INFO','WARN','ERROR','CRITICAL')),
  constraint app_error_events_status_check check (status in ('OPEN','RESOLVED','IGNORED'))
);

create index if not exists app_error_events_status_last_seen_idx
  on private.app_error_events(status, last_seen_at desc);
create index if not exists app_error_events_severity_last_seen_idx
  on private.app_error_events(severity, last_seen_at desc);

revoke all on table private.app_error_events from public, anon, authenticated;

create or replace function public.record_client_error(
  p_fingerprint text,
  p_error_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_path text default null,
  p_source text default null,
  p_stack text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $function$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_existing_notified timestamptz;
  v_existing boolean := false;
  v_severity text := upper(coalesce(nullif(trim(p_severity), ''), 'ERROR'));
  v_type text := upper(coalesce(nullif(trim(p_error_type), ''), 'CLIENT'));
  v_fingerprint text := left(coalesce(nullif(trim(p_fingerprint), ''), md5(coalesce(p_title,'') || '|' || coalesce(p_message,'') || '|' || coalesce(p_path,''))), 180);
  v_notify boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if v_severity not in ('INFO','WARN','ERROR','CRITICAL') then v_severity := 'ERROR'; end if;

  select id, last_notified_at
    into v_id, v_existing_notified
  from private.app_error_events
  where fingerprint = v_fingerprint
  for update;

  v_existing := found;

  if v_existing then
    update private.app_error_events
    set
      error_type = left(v_type, 40),
      severity = case
        when severity = 'CRITICAL' or v_severity = 'CRITICAL' then 'CRITICAL'
        when severity = 'ERROR' or v_severity = 'ERROR' then 'ERROR'
        when severity = 'WARN' or v_severity = 'WARN' then 'WARN'
        else 'INFO'
      end,
      title = left(coalesce(nullif(trim(p_title), ''), 'Unbekannter Fehler'), 180),
      message = left(coalesce(p_message, ''), 3000),
      path = left(p_path, 500),
      source = left(p_source, 500),
      stack = left(p_stack, 12000),
      metadata = coalesce(p_metadata, '{}'::jsonb),
      last_seen_at = now(),
      occurrence_count = occurrence_count + 1,
      last_user_id = v_user,
      status = 'OPEN',
      resolved_at = null,
      resolved_by = null
    where id = v_id;
  else
    insert into private.app_error_events(
      fingerprint,error_type,severity,title,message,path,source,stack,metadata,last_user_id
    ) values (
      v_fingerprint,left(v_type,40),v_severity,
      left(coalesce(nullif(trim(p_title), ''), 'Unbekannter Fehler'),180),
      left(coalesce(p_message,''),3000),
      left(p_path,500),left(p_source,500),left(p_stack,12000),
      coalesce(p_metadata,'{}'::jsonb),v_user
    )
    returning id into v_id;
  end if;

  v_notify := v_severity in ('ERROR','CRITICAL')
    and (not v_existing or v_existing_notified is null or v_existing_notified < now() - interval '30 minutes');

  if v_notify then
    insert into public.notifications(user_id,title,body,type)
    select p.id,
           case when v_severity='CRITICAL' then 'Kritischer Systemfehler' else 'Systemfehler erkannt' end,
           left(coalesce(nullif(trim(p_title), ''), p_message, 'Technischer Fehler'), 240),
           'SYSTEM_ERROR'
    from public.profiles p
    where p.role = 'HEAD_ADMIN'
      and coalesce(p.account_status, 'ACTIVE') = 'ACTIVE';

    update private.app_error_events set last_notified_at = now() where id = v_id;
  end if;

  return v_id;
end;
$function$;

create or replace function public.head_admin_error_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $function$
begin
  if auth.uid() is null or not public.ec_is_head_admin() then
    raise exception 'Keine Berechtigung';
  end if;

  return jsonb_build_object(
    'open_total', (select count(*) from private.app_error_events where status='OPEN'),
    'critical_open', (select count(*) from private.app_error_events where status='OPEN' and severity='CRITICAL'),
    'error_open', (select count(*) from private.app_error_events where status='OPEN' and severity='ERROR'),
    'warn_open', (select count(*) from private.app_error_events where status='OPEN' and severity='WARN'),
    'occurrences_24h', (select coalesce(sum(occurrence_count),0) from private.app_error_events where last_seen_at >= now()-interval '24 hours'),
    'updated_at', now()
  );
end;
$function$;

create or replace function public.head_admin_error_feed(
  p_status text default 'OPEN',
  p_limit integer default 100
)
returns table(
  id uuid,
  error_type text,
  severity text,
  title text,
  message text,
  path text,
  source text,
  stack text,
  metadata jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  occurrence_count bigint,
  status text,
  last_user_id uuid,
  last_user_nickname text
)
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $function$
declare
  v_status text := upper(coalesce(nullif(trim(p_status),''),'OPEN'));
begin
  if auth.uid() is null or not public.ec_is_head_admin() then
    raise exception 'Keine Berechtigung';
  end if;
  if v_status not in ('OPEN','RESOLVED','IGNORED','ALL') then v_status := 'OPEN'; end if;

  return query
  select e.id,e.error_type,e.severity,e.title,e.message,e.path,e.source,e.stack,e.metadata,
         e.first_seen_at,e.last_seen_at,e.occurrence_count,e.status,e.last_user_id,
         coalesce(p.nickname,p.first_name,'Unbekannt')::text
  from private.app_error_events e
  left join public.profiles p on p.id=e.last_user_id
  where v_status='ALL' or e.status=v_status
  order by
    case e.severity when 'CRITICAL' then 1 when 'ERROR' then 2 when 'WARN' then 3 else 4 end,
    e.last_seen_at desc
  limit greatest(1,least(coalesce(p_limit,100),250));
end;
$function$;

create or replace function public.head_admin_set_error_status(
  p_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $function$
declare
  v_status text := upper(coalesce(trim(p_status),''));
begin
  if auth.uid() is null or not public.ec_is_head_admin() then
    raise exception 'Keine Berechtigung';
  end if;
  if v_status not in ('OPEN','RESOLVED','IGNORED') then
    raise exception 'Ungültiger Status';
  end if;

  update private.app_error_events
  set status=v_status,
      resolved_at=case when v_status='OPEN' then null else now() end,
      resolved_by=case when v_status='OPEN' then null else auth.uid() end
  where id=p_id;

  if not found then return false; end if;

  insert into public.admin_log(actor_id,action,target_id,details)
  values(auth.uid(),'SYSTEM_ERROR_STATUS',auth.uid(),jsonb_build_object('error_id',p_id,'status',v_status));

  return true;
end;
$function$;

revoke all on function public.record_client_error(text,text,text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.record_client_error(text,text,text,text,text,text,text,text,jsonb) to authenticated;

revoke all on function public.head_admin_error_summary() from public, anon;
grant execute on function public.head_admin_error_summary() to authenticated;

revoke all on function public.head_admin_error_feed(text,integer) from public, anon;
grant execute on function public.head_admin_error_feed(text,integer) to authenticated;

revoke all on function public.head_admin_set_error_status(uuid,text) from public, anon;
grant execute on function public.head_admin_set_error_status(uuid,text) to authenticated;
