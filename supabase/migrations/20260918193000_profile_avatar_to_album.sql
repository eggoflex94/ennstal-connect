-- Ennstal Connect: automatically add newly uploaded profile avatars to the member photo album.

create or replace function public.ec_add_profile_avatar_to_album()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_url is null
     or new.avatar_url = ''
     or new.avatar_url is not distinct from old.avatar_url
     or new.avatar_url not like 'http%' then
    return new;
  end if;

  if not exists (
    select 1
    from public.member_photos p
    where p.owner_id = new.id
      and p.image_url = new.avatar_url
  ) then
    insert into public.member_photos(owner_id, image_url, caption, visibility)
    values (new.id, new.avatar_url, 'Profilbild', 'PUBLIC');
  end if;

  return new;
end;
$$;

revoke all on function public.ec_add_profile_avatar_to_album() from public;
revoke all on function public.ec_add_profile_avatar_to_album() from anon;
revoke all on function public.ec_add_profile_avatar_to_album() from authenticated;

drop trigger if exists trg_profile_avatar_to_album on public.profiles;
create trigger trg_profile_avatar_to_album
after update of avatar_url on public.profiles
for each row
when (old.avatar_url is distinct from new.avatar_url)
execute function public.ec_add_profile_avatar_to_album();
