-- Ennstal Connect: small, low-conflict repair for editing posts and news.
-- Run this file alone in Supabase SQL Editor. It does not alter tables.

create or replace function public.admin_update_news(
  p_news_id uuid, p_title text, p_content text, p_image_url text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.ec_is_admin() then raise exception 'Nur die Administration darf Neuigkeiten bearbeiten.'; end if;
  if char_length(trim(coalesce(p_title,''))) < 3 or char_length(trim(coalesce(p_content,''))) < 3 then
    raise exception 'Überschrift und Text müssen ausgefüllt sein.';
  end if;
  update public.news set title=trim(p_title), content=trim(p_content) where id=p_news_id;
  if not found then raise exception 'Neuigkeit nicht gefunden.'; end if;
end;
$$;

create or replace function public.forum_update_post(
  p_post_id uuid, p_title text, p_content text, p_reason text default null
) returns void language plpgsql security definer set search_path=public as $$
declare post_author uuid; post_scope text; is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  select author_id,scope into post_author,post_scope from public.forum_posts where id=p_post_id;
  if post_author is null then raise exception 'Beitrag nicht gefunden.'; end if;
  is_owner := post_author=auth.uid();
  if not is_owner and not public.ec_is_admin() and not (post_scope='COMMUNITY' and public.ec_is_forum_moderator()) then
    raise exception 'Keine Berechtigung zum Bearbeiten dieses Beitrags.';
  end if;
  if char_length(trim(coalesce(p_title,''))) < 3 or char_length(trim(coalesce(p_content,''))) < 3 then
    raise exception 'Überschrift und Beitrag müssen mindestens drei Zeichen enthalten.';
  end if;
  update public.forum_posts set title=trim(p_title), content=trim(p_content), edited_at=now(), edited_by=auth.uid(),
    edit_reason=case when is_owner then 'Vom Autor bearbeitet' else trim(coalesce(p_reason,'Von der Moderation bearbeitet')) end
  where id=p_post_id;
end;
$$;

create or replace function public.forum_delete_post(p_post_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare post_author uuid; post_scope text;
begin
  select author_id,scope into post_author,post_scope from public.forum_posts where id=p_post_id;
  if post_author is null then raise exception 'Beitrag nicht gefunden.'; end if;
  if post_author<>auth.uid() and not public.ec_is_admin() and not (post_scope='COMMUNITY' and public.ec_is_forum_moderator()) then
    raise exception 'Keine Berechtigung zum Löschen dieses Beitrags.';
  end if;
  delete from public.forum_posts where id=p_post_id;
end;
$$;

revoke all on function public.admin_update_news(uuid,text,text,text) from public;
revoke all on function public.forum_update_post(uuid,text,text,text) from public;
revoke all on function public.forum_delete_post(uuid) from public;
grant execute on function public.admin_update_news(uuid,text,text,text) to authenticated;
grant execute on function public.forum_update_post(uuid,text,text,text) to authenticated;
grant execute on function public.forum_delete_post(uuid) to authenticated;
notify pgrst, 'reload schema';
