-- Remove ineffective anonymous table grants that are already blocked by RLS.
-- A privilege is revoked only when no matching policy exists for anon or PUBLIC.
do $$
declare
  r record;
  v_anon oid := (select oid from pg_roles where rolname='anon');
begin
  for r in
    select c.oid, format('%I.%I', n.nspname, c.relname) as fqname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relrowsecurity
  loop
    if has_table_privilege('anon', r.oid, 'SELECT')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid=r.oid
           and p.polcmd in ('r','*')
           and (0=any(p.polroles) or v_anon=any(p.polroles))
       ) then
      execute format('revoke select on table %s from anon', r.fqname);
    end if;

    if has_table_privilege('anon', r.oid, 'INSERT')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid=r.oid
           and p.polcmd in ('a','*')
           and (0=any(p.polroles) or v_anon=any(p.polroles))
       ) then
      execute format('revoke insert on table %s from anon', r.fqname);
    end if;

    if has_table_privilege('anon', r.oid, 'UPDATE')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid=r.oid
           and p.polcmd in ('w','*')
           and (0=any(p.polroles) or v_anon=any(p.polroles))
       ) then
      execute format('revoke update on table %s from anon', r.fqname);
    end if;

    if has_table_privilege('anon', r.oid, 'DELETE')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid=r.oid
           and p.polcmd in ('d','*')
           and (0=any(p.polroles) or v_anon=any(p.polroles))
       ) then
      execute format('revoke delete on table %s from anon', r.fqname);
    end if;
  end loop;
end $$;
