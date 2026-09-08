insert into public.regions (slug,name,short_name,description,accent,sort_order,is_active)
values (
  'ueberregional',
  'Überregional',
  'Überregional',
  'Für Mitglieder, deren Wohnort außerhalb der derzeitigen Ennstal-Connect-Regionen liegt.',
  '#5b6b7a',
  40,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  accent = excluded.accent,
  sort_order = excluded.sort_order,
  is_active = true;
