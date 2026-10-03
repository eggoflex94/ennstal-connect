alter table public.profiles drop constraint if exists profiles_layout_allowed;

alter table public.profiles
  add constraint profiles_layout_allowed
  check (profile_layout = any (array[
    'standard'::text,
    'theme-red'::text,
    'theme-alpine'::text,
    'theme-blue'::text,
    'theme-teal'::text,
    'theme-violet'::text,
    'theme-copper'::text,
    'theme-aurora'::text,
    'theme-neon-pink'::text,
    'theme-neon'::text
  ]));
