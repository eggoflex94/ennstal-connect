-- Ennstal Connect: keep one album row when an existing avatar is only re-edited.
-- A newly uploaded replacement remains a new album photo; this helper is called only
-- from the "Profilbild ausrichten" flow.

create or replace function public.ec_reconcile_edited_profile_album_image(
  p_old_url text,
  p_new_url text,
  p_kind text default 'AVATAR'
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_keep_id uuid;
  v_new_id uuid;
  v_caption text;
begin
  if v_user is null then
    raise exception 'Bitte zuerst anmelden.';
  end if;

  if coalesce(p_old_url,'') = '' or coalesce(p_new_url,'') = '' then
    return;
  end if;

  v_caption := case upper(coalesce(p_kind,'AVATAR'))
    when 'COVER' then 'Aktuelles Titelbild'
    else 'Profilbild'
  end;

  select id into v_keep_id
  from public.member_photos
  where owner_id=v_user
    and image_url=p_old_url
  order by created_at asc
  limit 1;

  select id into v_new_id
  from public.member_photos
  where owner_id=v_user
    and image_url=p_new_url
  order by created_at desc
  limit 1;

  if v_keep_id is null then
    return;
  end if;

  if v_new_id is not null and v_new_id <> v_keep_id then
    delete from public.member_photos
    where id=v_new_id
      and owner_id=v_user;
  end if;

  update public.member_photos
  set image_url=p_new_url,
      caption=v_caption
  where id=v_keep_id
    and owner_id=v_user;
end;
$function$;

revoke all on function public.ec_reconcile_edited_profile_album_image(text,text,text) from public;
revoke all on function public.ec_reconcile_edited_profile_album_image(text,text,text) from anon;
grant execute on function public.ec_reconcile_edited_profile_album_image(text,text,text) to authenticated;

notify pgrst,'reload schema';
