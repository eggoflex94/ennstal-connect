alter table public.profiles add column if not exists district_visibility text not null default 'PUBLIC' check (district_visibility in ('PUBLIC','FRIENDS'));
-- Existing member districts remain unchanged; members choose a district on their next profile save.
