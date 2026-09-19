-- Ennstal Connect: automatically store profile covers in a dedicated "Titelbilder" album.

create or replace function public.ec_add_profile_cover_to_album()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_folder_id uuid;
begin
  if new.profile_background is null
     or new.profile_background = ''
     or new.profile_background not like 'http%' then
    if old.profile_background like 'http%' then
      update public.member_photos
      set caption = 'Titelbild'
      where owner_id = new.id
        and image_url = old.profile_background
        and caption = 'Aktuelles Titelbild';
    end if;
    return new;
  end if;

  select f.id
    into v_folder_id
  from public.profile_photo_folders f
  where f.owner_id = new.id
    and lower(trim(f.title)) = 'titelbilder'
  order by f.created_at asc
  limit 1;

  if v_folder_id is null then
    insert into public.profile_photo_folders(owner_id, title)
    values (new.id, 'Titelbilder')
    returning id into v_folder_id;
  end if;

  update public.member_photos
  set caption = 'Titelbild'
  where owner_id = new.id
    and folder_id = v_folder_id
    and caption = 'Aktuelles Titelbild'
    and image_url is distinct from new.profile_background;

  if exists (
    select 1
    from public.member_photos p
    where p.owner_id = new.id
      and p.image_url = new.profile_background
  ) then
    update public.member_photos
    set folder_id = v_folder_id,
        caption = 'Aktuelles Titelbild',
        visibility = 'PUBLIC'
    where owner_id = new.id
      and image_url = new.profile_background;
  else
    insert into public.member_photos(owner_id, image_url, caption, visibility, folder_id)
    values (new.id, new.profile_background, 'Aktuelles Titelbild', 'PUBLIC', v_folder_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_profile_cover_to_album on public.profiles;
create trigger trg_profile_cover_to_album
after update of profile_background on public.profiles
for each row
when (old.profile_background is distinct from new.profile_background)
execute function public.ec_add_profile_cover_to_album();

insert into public.profile_photo_folders(owner_id, title)
select p.id, 'Titelbilder'
from public.profiles p
where p.profile_background like 'http%'
  and not exists (
    select 1
    from public.profile_photo_folders f
    where f.owner_id = p.id
      and lower(trim(f.title)) = 'titelbilder'
  );

insert into public.member_photos(owner_id, image_url, caption, visibility, folder_id)
select
  p.id,
  p.profile_background,
  'Aktuelles Titelbild',
  'PUBLIC',
  f.id
from public.profiles p
join lateral (
  select pf.id
  from public.profile_photo_folders pf
  where pf.owner_id = p.id
    and lower(trim(pf.title)) = 'titelbilder'
  order by pf.created_at asc
  limit 1
) f on true
where p.profile_background like 'http%'
  and not exists (
    select 1
    from public.member_photos mp
    where mp.owner_id = p.id
      and mp.image_url = p.profile_background
  );

update public.member_photos mp
set folder_id = f.id,
    caption = 'Aktuelles Titelbild',
    visibility = 'PUBLIC'
from public.profiles p
join lateral (
  select pf.id
  from public.profile_photo_folders pf
  where pf.owner_id = p.id
    and lower(trim(pf.title)) = 'titelbilder'
  order by pf.created_at asc
  limit 1
) f on true
where mp.owner_id = p.id
  and mp.image_url = p.profile_background
  and p.profile_background like 'http%';

notify pgrst, 'reload schema';
