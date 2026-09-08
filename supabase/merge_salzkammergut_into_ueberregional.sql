-- Merge the former Salzkammergut region into Überregional.
-- Safe to run repeatedly.

insert into public.regions (slug,name,short_name,description,accent,sort_order,is_active)
values (
  'ueberregional',
  'Überregional',
  'Überregional',
  'Für Mitglieder aus dem Salzkammergut und allen Orten außerhalb der Ennstal-Connect-Kernregionen.',
  '#5b6b7a',
  30,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  is_active = true;

do $$
declare
  old_id uuid;
  new_id uuid;
  rec record;
begin
  select id into old_id from public.regions where slug = 'salzkammergut' limit 1;
  select id into new_id from public.regions where slug = 'ueberregional' limit 1;

  if new_id is null then
    raise exception 'Überregional region could not be resolved';
  end if;

  if old_id is null then
    return;
  end if;

  -- Move all members first.
  update public.profiles
     set home_region_id = new_id
   where home_region_id = old_id;

  -- Avoid duplicate regional-admin assignments when an admin already has both regions.
  if to_regclass('public.regional_admin_assignments') is not null then
    delete from public.regional_admin_assignments old
     where old.region_id = old_id
       and exists (
         select 1
           from public.regional_admin_assignments current
          where current.user_id = old.user_id
            and current.region_id = new_id
       );
    update public.regional_admin_assignments
       set region_id = new_id
     where region_id = old_id;
  end if;

  -- Move regional content. Only tables that actually contain region_id are touched.
  for rec in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name = 'region_id'
       and c.table_name not in ('regions','profiles','regional_admin_assignments')
  loop
    begin
      execute format('update public.%I set region_id = $1 where region_id = $2', rec.table_name)
        using new_id, old_id;
    exception
      when unique_violation then
        raise notice 'Skipped % because a unique constraint needs manual conflict resolution', rec.table_name;
    end;
  end loop;

  -- Keep the historic row for referential/audit safety, but remove it from all user-facing lists.
  update public.regions
     set is_active = false,
         description = 'Ehemalige Region. Inhalte und Mitglieder wurden nach Überregional übernommen.'
   where id = old_id;
end $$;
