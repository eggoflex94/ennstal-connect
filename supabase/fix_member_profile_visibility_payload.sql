create or replace function public.community_member_directory()
returns setof jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with viewer as (
    select exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.role in ('ADMIN', 'HEAD_ADMIN')
        and me.account_status = 'ACTIVE'
    ) as is_admin
  )
  select (
    to_jsonb(p)
    || jsonb_build_object(
      'last_name',
      case
        when viewer.is_admin then p.last_name
        when coalesce(p.privacy_settings ->> 'last_name', 'PUBLIC') = 'ADMIN_ONLY' then null
        else p.last_name
      end,
      'is_online',
      case
        when coalesce(p.hide_online_status, false) then false
        else coalesce(p.is_online, false)
          and p.last_active_at is not null
          and p.last_active_at >= now() - interval '5 minutes'
      end,
      'last_active_at',
      case when coalesce(p.hide_online_status, false) then null else p.last_active_at end,
      'regional_admin_region_ids',
      coalesce((
        select jsonb_agg(raa.region_id order by r.sort_order, r.name)
        from public.regional_admin_assignments raa
        join public.regions r on r.id = raa.region_id
        where raa.user_id = p.id and raa.active = true
      ), '[]'::jsonb),
      'regional_admin_regions',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'slug', r.slug,
            'name', r.name,
            'short_name', r.short_name
          )
          order by r.sort_order, r.name
        )
        from public.regional_admin_assignments raa
        join public.regions r on r.id = raa.region_id
        where raa.user_id = p.id and raa.active = true
      ), '[]'::jsonb)
    )
  )
         - 'login_email'
         - 'suspension_reason'
         - 'weekly_online_seconds'
         - 'weekly_reward_awarded_at'
         - 'warnings_count'
  from public.profiles p
  cross join viewer
  where auth.uid() is not null
    and p.account_status = 'ACTIVE'
    and not coalesce(p.is_test_account, false)
  order by
    case
      when p.role = 'HEAD_ADMIN' then 1
      when p.role = 'ADMIN' then 2
      when exists(
        select 1
        from public.regional_admin_assignments raa
        where raa.user_id = p.id
          and raa.active = true
      ) then 3
      when p.account_badge = 'BUSINESS' then 4
      when p.role = 'SUPPORTER' then 5
      else 6
    end,
    lower(p.nickname);
$function$;
