do $$
declare r record;
begin
  for r in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind='r'
      and c.relrowsecurity
      and not exists (
        select 1 from pg_policy p where p.polrelid=c.oid
      )
  loop
    execute format('revoke all privileges on table %s from anon, authenticated', r.tbl);
  end loop;
end $$;
