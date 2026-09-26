-- Hide admin RPCs that are not referenced by the current production bundle.
-- They remain in the database for rollback/internal compatibility, but are no
-- longer directly callable by signed-in clients. Internal owner-level calls
-- (for example admin_system_watch_summary -> admin_reload_watch) keep working.
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
        'admin_account_review_queue',
        'admin_attention_summary',
        'admin_delete_homepage_frame',
        'admin_profile_reports',
        'admin_queue_existing_registration',
        'admin_registration_approval_queue',
        'admin_reload_watch',
        'admin_remove_reported_member_photo',
        'admin_set_business_jobs_enabled',
        'admin_set_temporary_supporter',
        'admin_system_watch_summary',
        'admin_update_homepage_frame'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;
