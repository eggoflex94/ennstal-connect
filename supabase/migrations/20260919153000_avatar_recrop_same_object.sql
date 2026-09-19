-- Ennstal Connect: re-cropping the current avatar must not create another album photo.
-- Ignore cache-busting query parameters when deciding whether the avatar changed.

create or replace function public.ec_add_profile_avatar_to_album()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_base text;
  v_old_base text;
begin
  if new.avatar_url is null
     or new.avatar_url = ''
     or new.avatar_url not like 'http%' then
    return new;
  end if;

  v_new_base := split_part(new.avatar_url, '?', 1);
  v_old_base := split_part(coalesce(old.avatar_url,''), '?', 1);

  if v_new_base = v_old_base and v_new_base <> '' then
    return new;
  end if;

  if not exists (
    select 1
    from public.member_photos p
    where p.owner_id = new.id
      and split_part(p.image_url, '?', 1) = v_new_base
  ) then
    insert into public.member_photos(owner_id, image_url, caption, visibility)
    values (new.id, new.avatar_url, 'Profilbild', 'PUBLIC');
  end if;

  return new;
end;
$function$;

notify pgrst,'reload schema';
