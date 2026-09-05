create or replace function public.admin_remove_profile_media(p_user_id uuid,p_field text)
returns void language plpgsql security definer set search_path=public,storage as $$
declare v_url text; v_path text;
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Head Admin darf fremde Profilbilder entfernen.'; end if;
  if p_user_id=auth.uid() then raise exception 'Eigene Bilder bitte in der Profilbearbeitung löschen.'; end if;
  if p_field not in ('avatar_url','profile_background','bio_image_url') then raise exception 'Ungültiger Bildbereich.'; end if;
  if not exists(select 1 from public.pending_privileged_actions where actor_id=auth.uid() and prepared_at>now()-interval '3 minutes') then raise exception 'Eine Begründung ist verpflichtend.'; end if;
  execute format('select %I from public.profiles where id=$1',p_field) into v_url using p_user_id;
  if p_field='profile_background' then update public.profiles set profile_background='#1b1f26' where id=p_user_id;
  elsif p_field='avatar_url' then update public.profiles set avatar_url=null where id=p_user_id;
  else update public.profiles set bio_image_url=null where id=p_user_id; end if;
  if position('/storage/v1/object/public/profile-avatars/' in coalesce(v_url,''))>0 then
    v_path:=split_part(split_part(v_url,'/storage/v1/object/public/profile-avatars/',2),'?',1);
    if v_path like p_user_id::text||'/%' then delete from storage.objects where bucket_id='profile-avatars' and name=v_path; end if;
  end if;
end; $$;
revoke all on function public.admin_remove_profile_media(uuid,text) from public,anon;
grant execute on function public.admin_remove_profile_media(uuid,text) to authenticated;
notify pgrst,'reload schema';
