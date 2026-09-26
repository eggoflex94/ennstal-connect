-- Keep production RPC grants aligned with the intended access model.
-- This migration is intentionally narrow: only anonymous exposure that is
-- clearly unnecessary is removed. Public read RPCs remain public.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proname like 'admin_%' or p.proname like 'head_admin_%')
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated', r.fn);
  end loop;
end $$;

-- Signed-in authorization helpers do not need an anonymous API surface.
revoke execute on function public.ec_has_admin_permission(text) from public, anon;
grant execute on function public.ec_has_admin_permission(text) to authenticated;

revoke execute on function public.ec_is_primary_head_admin() from public, anon;
grant execute on function public.ec_is_primary_head_admin() to authenticated;

-- Trigger-only function: never expose it as an RPC.
revoke execute on function public.ec_enforce_point_auto_suspension()
from public, anon, authenticated;

-- The featured-group card may remain public, but guests must not receive
-- individual member UUIDs.
create or replace function public.featured_community_group()
returns table(
  id uuid,
  name text,
  description text,
  image_url text,
  created_by uuid,
  owner_id uuid,
  created_at timestamptz,
  member_ids uuid[],
  member_count bigint
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    g.id,
    g.name,
    g.description,
    g.image_url,
    g.created_by,
    g.owner_id,
    g.created_at,
    case
      when auth.uid() is null then '{}'::uuid[]
      else coalesce(
        array_agg(gm.user_id) filter (
          where p.id is not null
            and p.account_status = 'ACTIVE'
            and not coalesce(p.is_test_account,false)
        ),
        '{}'::uuid[]
      )
    end as member_ids,
    count(gm.user_id) filter (
      where p.id is not null
        and p.account_status = 'ACTIVE'
        and not coalesce(p.is_test_account,false)
    ) as member_count
  from public.community_groups g
  left join public.community_group_members gm on gm.group_id = g.id
  left join public.profiles p on p.id = gm.user_id
  where g.is_featured
  group by g.id
  limit 1;
$function$;

grant execute on function public.featured_community_group() to anon, authenticated;
