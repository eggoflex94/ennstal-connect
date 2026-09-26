-- Internal helper RPCs below are invoked by privileged database functions,
-- not directly by the current client. Remove their direct authenticated API
-- surface while keeping internal SECURITY DEFINER calls working as the owner.
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
        'ec_audit_insert',
        'ec_enforce_rate_limit',
        'ec_admin_can_moderate_target',
        'ec_effective_role_for',
        'ec_send_assignment_message',
        'ec_send_admin_forum_welcome'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
  end loop;
end $$;
