create or replace function public.community_group_directory()
returns table(id uuid, name text, description text, image_url text, created_by uuid, owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id,g.name,g.description,g.image_url,g.created_by,g.owner_id,g.created_at,
         case
           when auth.uid() is null then '{}'::uuid[]
           else coalesce(array_agg(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false)), '{}'::uuid[])
         end as member_ids,
         count(gm.user_id) filter (where p.id is not null and p.account_status='ACTIVE' and not coalesce(p.is_test_account,false)) as member_count
  from public.community_groups g
  left join public.community_group_members gm on gm.group_id=g.id
  left join public.profiles p on p.id=gm.user_id
  group by g.id
  order by g.created_at desc;
$function$;

create or replace function public.ec_region_group_directory(p_region uuid)
returns table(id uuid, name text, description text, image_url text, created_by uuid, owner_id uuid, created_at timestamptz, member_ids uuid[], member_count bigint, region_id uuid, is_featured boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id, g.name, g.description, g.image_url, g.created_by, g.owner_id, g.created_at,
    case
      when auth.uid() is null then '{}'::uuid[]
      else coalesce(array_agg(gm.user_id) filter (
        where p.id is not null and p.account_status = 'ACTIVE' and not coalesce(p.is_test_account, false)
      ), '{}'::uuid[])
    end as member_ids,
    count(gm.user_id) filter (
      where p.id is not null and p.account_status = 'ACTIVE' and not coalesce(p.is_test_account, false)
    ) as member_count,
    g.region_id, g.is_featured
  from public.community_groups g
  left join public.community_group_members gm on gm.group_id = g.id
  left join public.profiles p on p.id = gm.user_id
  where g.region_id = p_region
  group by g.id
  order by g.created_at desc;
$function$;
