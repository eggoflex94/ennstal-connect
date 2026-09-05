-- Member-controlled, safely constrained profile design options.
alter table public.profiles add column if not exists bio_color text not null default '#f1f5f9';
alter table public.profiles drop constraint if exists profiles_bio_color_format;
alter table public.profiles add constraint profiles_bio_color_format check (bio_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.profiles drop constraint if exists profiles_bio_font_allowed;
alter table public.profiles add constraint profiles_bio_font_allowed check (bio_font in ('modern','serif','handwritten'));
alter table public.profiles drop constraint if exists profiles_bio_size_allowed;
alter table public.profiles add constraint profiles_bio_size_allowed check (bio_size in ('small','normal','large'));
alter table public.profiles drop constraint if exists profiles_layout_allowed;
alter table public.profiles add constraint profiles_layout_allowed check (profile_layout in ('standard','alpine','aurora','ocean','slate','ember','redwood','lavender','midnight','sunrise'));
notify pgrst,'reload schema';
