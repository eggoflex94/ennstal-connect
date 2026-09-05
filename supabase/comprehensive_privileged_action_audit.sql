-- Applied to production on 2026-09-05.
-- Records metadata for privileged changes without copying message/post contents.
create or replace function public.ec_audit_privileged_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_group_text text;
  v_target_text text;
  v_target uuid;
  v_privileged boolean := false;
  v_changed text[];
begin
  if v_actor is null then return coalesce(new,old); end if;
  v_row := case when tg_op='DELETE' then v_old else v_new end;

  select exists(
    select 1 from public.profiles p
    where p.id=v_actor and (
      p.role::text in ('HEAD_ADMIN','ADMIN','SUPPORTER')
      or coalesce(p.forum_moderator,false)
    )
  ) into v_privileged;

  v_group_text := coalesce(v_row->>'group_id', case when tg_table_name='community_groups' then v_row->>'id' end);
  if not v_privileged and v_group_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select exists(select 1 from public.community_groups g where g.id=v_group_text::uuid and g.owner_id=v_actor)
    into v_privileged;
  end if;
  if not v_privileged then return coalesce(new,old); end if;

  v_target_text := coalesce(v_row->>'target_user',v_row->>'user_id',v_row->>'owner_id',v_row->>'author_id',v_row->>'receiver_id');
  if v_target_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_target:=v_target_text::uuid; end if;

  if tg_op='UPDATE' then
    select coalesce(array_agg(n.key order by n.key),'{}'::text[])
    into v_changed
    from jsonb_each(v_new) n
    where v_old->n.key is distinct from n.value
      and n.key not in ('content','body','message','warning_text','admin_note');
  end if;

  insert into public.admin_log(actor_id,action,target_id,details)
  values(v_actor,'PRIVILEGED_'||tg_op,v_target,
    jsonb_strip_nulls(jsonb_build_object(
      'area',tg_table_name,
      'operation',tg_op,
      'record_id',v_row->>'id',
      'group_id',v_group_text,
      'changed_fields',to_jsonb(v_changed)
    )));
  return coalesce(new,old);
end;
$$;
revoke all on function public.ec_audit_privileged_change() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_permissions','user_feature_locks','user_reports','messages','news','events',
    'community_events','community_ads','community_groups','community_group_members','group_members',
    'forum_posts','forum_replies','member_photos','member_photo_comments','homepage_sections','community_requests'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists ec_privileged_audit on public.%I',t);
      execute format('create trigger ec_privileged_audit after insert or update or delete on public.%I for each row execute function public.ec_audit_privileged_change()',t);
    end if;
  end loop;
end $$;

create or replace function public.get_admin_log(p_limit integer default 500)
returns table(id uuid,actor_id uuid,action text,target_id uuid,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Global Admin darf das Logbuch sehen.'; end if;
  return query select l.id,l.actor_id,l.action,l.target_id,l.details,l.created_at
  from public.admin_log l order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;
revoke all on function public.get_admin_log(integer) from public;
revoke execute on function public.get_admin_log(integer) from anon;
grant execute on function public.get_admin_log(integer) to authenticated;
notify pgrst,'reload schema';