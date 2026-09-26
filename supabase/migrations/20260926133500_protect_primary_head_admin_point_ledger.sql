-- Protect the primary Head Admin point ledger from every other admin account.
-- The primary Head Admin can still read their own ledger.

create or replace function public.profile_point_feed(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_user_role text;
  v_user_is_primary boolean := false;
  v_target_role text;
  v_target_is_primary boolean := false;
  v_target_region uuid;
  v_allowed boolean := false;
  v_progress jsonb;
  v_manual integer := 0;
  v_history jsonb := '[]'::jsonb;
  v_status text;
  v_reason text;
begin
  if v_user is null then raise exception 'Nicht angemeldet'; end if;

  select role::text, coalesce(is_primary_head_admin,false)
    into v_user_role, v_user_is_primary
  from public.profiles
  where id=v_user and account_status='ACTIVE';
  if not found then raise exception 'Aktives Profil nicht gefunden'; end if;

  select role::text, coalesce(is_primary_head_admin,false), home_region_id, account_status, suspension_reason
    into v_target_role, v_target_is_primary, v_target_region, v_status, v_reason
  from public.profiles
  where id=p_user_id;
  if not found then raise exception 'Mitglied nicht gefunden'; end if;

  if v_target_is_primary and v_user <> p_user_id then
    raise exception 'Die Punkteliste des Hauptadmins ist privat.';
  end if;

  if v_user = p_user_id then
    v_allowed := true;
  elsif v_user_is_primary then
    v_allowed := true;
  elsif upper(coalesce(v_target_role,'')) = 'HEAD_ADMIN' then
    v_allowed := false;
  elsif upper(coalesce(v_user_role,'')) = 'ADMIN' then
    v_allowed := true;
  elsif upper(coalesce(v_user_role,''))='SUPPORTER' then
    select exists(
      select 1 from public.regional_admin_assignments
      where user_id=v_user and region_id=v_target_region and active=true
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'Punktelisten sind nur für berechtigte Admins sichtbar';
  end if;

  v_progress := private.ec_activity_score(p_user_id);
  select coalesce(points,0) into v_manual from public.profiles where id=p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,
    'amount',x.amount,
    'kind',x.kind::text,
    'reason',x.reason,
    'category',x.category,
    'automated',x.automated,
    'created_at',x.created_at,
    'actor_id',x.actor_id,
    'actor_nickname',x.actor_nickname,
    'actor_role',x.actor_role,
    'actor_is_regional_admin',x.actor_is_regional_admin,
    'actor_account_badge',x.actor_account_badge,
    'actor_star',x.actor_star,
    'source_type',x.source_type
  ) order by x.created_at desc),'[]'::jsonb)
  into v_history
  from (
    select pt.*,
      p.nickname as actor_nickname,
      p.role::text as actor_role,
      p.account_badge as actor_account_badge,
      exists(select 1 from public.regional_admin_assignments raa where raa.user_id=pt.actor_id and raa.active=true) as actor_is_regional_admin,
      case
        when pt.actor_id is null then null
        when p.role::text in ('HEAD_ADMIN','ADMIN') then '/role-star-red.svg'
        when exists(select 1 from public.regional_admin_assignments raa where raa.user_id=pt.actor_id and raa.active=true) then '/role-star-red.svg'
        when p.role::text='SUPPORTER' then '/supporter-star.svg'
        when p.account_badge='BUSINESS' then '/role-star-blue.svg'
        else null
      end as actor_star
    from public.point_transactions pt
    left join public.profiles p on p.id=pt.actor_id
    where pt.member_id=p_user_id
    order by pt.created_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'member_id',p_user_id,
    'score',coalesce((v_progress->>'score')::integer,0),
    'manual_adjustment',v_manual,
    'components',coalesce(v_progress->'components','{}'::jsonb),
    'history',v_history,
    'account_status',v_status,
    'suspension_reason',v_reason
  );
end;
$function$;

revoke all on function public.profile_point_feed(uuid) from anon;
grant execute on function public.profile_point_feed(uuid) to authenticated;

drop policy if exists admins_can_view_pending_points on public.point_transactions;
create policy admins_can_view_pending_points
on public.point_transactions
for select
to authenticated
using (
  is_admin_or_head()
  and not exists (
    select 1
    from public.profiles target
    where target.id = point_transactions.member_id
      and coalesce(target.is_primary_head_admin,false) = true
      and target.id <> auth.uid()
  )
);

drop policy if exists regional_admins_can_view_region_points on public.point_transactions;
create policy regional_admins_can_view_region_points
on public.point_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.regional_admin_assignments raa
    join public.profiles target on target.id = point_transactions.member_id
    where raa.user_id = auth.uid()
      and raa.active = true
      and target.home_region_id = raa.region_id
      and not (
        coalesce(target.is_primary_head_admin,false) = true
        and target.id <> auth.uid()
      )
  )
);
