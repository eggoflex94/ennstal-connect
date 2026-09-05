-- Ennstal Connect: optional public social handles for member profiles.
-- Safe to run repeatedly in the Supabase SQL editor.

alter table public.profiles
  add column if not exists instagram_username text,
  add column if not exists snapchat_username text;

alter table public.profiles drop constraint if exists profiles_instagram_username_length;
alter table public.profiles add constraint profiles_instagram_username_length
  check (instagram_username is null or char_length(instagram_username) <= 50);

alter table public.profiles drop constraint if exists profiles_snapchat_username_length;
alter table public.profiles add constraint profiles_snapchat_username_length
  check (snapchat_username is null or char_length(snapchat_username) <= 50);

notify pgrst, 'reload schema';
