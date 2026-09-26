-- Retire duplicate/legacy presence RPCs from the direct authenticated API.
-- The current client uses record_presence, record_online_activity, and
-- record_online_time. admin_system_watch_summary internally calls
-- admin_online_status_watch, so that helper remains available to the database
-- owner but no longer directly exposed to signed-in clients.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and p.proname in (
        'ec_touch_presence',
        'set_user_online',
        'set_user_offline',
        'update_online_status',
        'admin_online_status_watch',
        'admin_repair_stale_online_statuses'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;
