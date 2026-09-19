-- Ennstal Connect: editable profile cover positioning.
alter table public.profiles
  add column if not exists profile_background_position_x numeric not null default 50,
  add column if not exists profile_background_position_y numeric not null default 50,
  add column if not exists profile_background_zoom numeric not null default 1,
  add column if not exists profile_background_overlay numeric not null default 0.18;

alter table public.profiles drop constraint if exists profiles_background_position_x_check;
alter table public.profiles add constraint profiles_background_position_x_check
  check (profile_background_position_x between 0 and 100);

alter table public.profiles drop constraint if exists profiles_background_position_y_check;
alter table public.profiles add constraint profiles_background_position_y_check
  check (profile_background_position_y between 0 and 100);

alter table public.profiles drop constraint if exists profiles_background_zoom_check;
alter table public.profiles add constraint profiles_background_zoom_check
  check (profile_background_zoom between 1 and 2.5);

alter table public.profiles drop constraint if exists profiles_background_overlay_check;
alter table public.profiles add constraint profiles_background_overlay_check
  check (profile_background_overlay between 0 and 0.7);

notify pgrst,'reload schema';
