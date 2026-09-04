-- Run once in the Supabase SQL editor before releasing the enhanced profile editor.
alter table public.profiles add column if not exists bio_image_url text;
alter table public.profiles add column if not exists bio_font text not null default 'modern';
alter table public.profiles add column if not exists bio_size text not null default 'normal';

alter table public.profiles drop constraint if exists profiles_bio_font_check;
alter table public.profiles add constraint profiles_bio_font_check check (bio_font in ('modern','serif','handwritten'));
alter table public.profiles drop constraint if exists profiles_bio_size_check;
alter table public.profiles add constraint profiles_bio_size_check check (bio_size in ('small','normal','large'));
