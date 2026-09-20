-- Public profile social overview for authenticated community members.
-- Keeps friend/group/forum counts consistent and powers the in-profile tab view.

create or replace function public.ec_profile_social_overview(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_viewer uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_friends jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_posts jsonb := '[]'::jsonb;
  v_friend_count integer := 0;
  v_group_count integer := 0;
  v_post_count integer := 0;
begin
  if v_viewer is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
    and account_status = 'ACTIVE'
    and coalesce(is_test_account,false) = false;

  if not found then
    raise exception 'Profil nicht gefunden';
  end if;

  select count(*)::integer
  into v_friend_count
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id=p_user_id then f.receiver_id else f.requester_id end
  where upper(f.status)='ACCEPTED'
    and (f.requester_id=p_user_id or f.receiver_id=p_user_id)
    and p.account_status='ACTIVE'
    and coalesce(p.is_test_account,false)=false;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.nickname),'[]'::jsonb)
  into v_friends
  from (
    select
      p.id,
      p.nickname,
      p.first_name,
      p.last_name,
      p.birth_date,
      p.avatar_url,
      p.role::text as role,
      p.account_badge,
      p.home_region_id,
      p.is_online,
      p.last_active_at,
      p.is_verified,
      p.gender
    from public.friendships f
    join public.profiles p
      on p.id = case when f.requester_id=p_user_id then f.receiver_id else f.requester_id end
    where upper(f.status)='ACCEPTED'
      and (f.requester_id=p_user_id or f.receiver_id=p_user_id)
      and p.account_status='ACTIVE'
      and coalesce(p.is_test_account,false)=false
    order by p.nickname
    limit 100
  ) x;

  select count(*)::integer
  into v_group_count
  from public.community_groups g
  where g.created_by=p_user_id
     or g.owner_id=p_user_id
     or exists (
       select 1 from public.community_group_members gm
       where gm.group_id=g.id and gm.user_id=p_user_id
     );

  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
  into v_groups
  from (
    select
      g.id,
      g.name,
      g.description,
      g.image_url,
      g.region_id,
      g.created_by,
      g.owner_id,
      g.created_at,
      (
        select count(*)::integer
        from public.community_group_members gm2
        where gm2.group_id=g.id
      ) as member_count
    from public.community_groups g
    where g.created_by=p_user_id
       or g.owner_id=p_user_id
       or exists (
         select 1 from public.community_group_members gm
         where gm.group_id=g.id and gm.user_id=p_user_id
       )
    order by g.name
    limit 100
  ) x;

  select count(*)::integer
  into v_post_count
  from public.forum_posts fp
  where fp.author_id=p_user_id
    and fp.scope='COMMUNITY';

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_posts
  from (
    select
      fp.id,
      fp.title,
      fp.content,
      fp.created_at,
      fp.edited_at,
      fp.region_id,
      fp.is_ai_generated
    from public.forum_posts fp
    where fp.author_id=p_user_id
      and fp.scope='COMMUNITY'
    order by fp.created_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'friend_count',v_friend_count,
    'group_count',v_group_count,
    'forum_post_count',v_post_count,
    'friends',v_friends,
    'groups',v_groups,
    'forum_posts',v_posts
  );
end;
$function$;

revoke all on function public.ec_profile_social_overview(uuid) from public, anon;
grant execute on function public.ec_profile_social_overview(uuid) to authenticated;
