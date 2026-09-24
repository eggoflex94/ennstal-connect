-- Runtime error cleanup verified against production on 2026-09-24.
-- Keeps admin-only alert counts behind an authenticated SECURITY DEFINER RPC
-- and removes duplicate indexes reported by the Supabase performance advisor.

create or replace function public.admin_attention_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
  v_reports bigint := 0;
  v_verifications bigint := 0;
  v_deletions bigint := 0;
  v_group_changes bigint := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'reports', 0,
      'verifications', 0,
      'deletions', 0,
      'group_changes', 0,
      'total', 0
    );
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'ACTIVE'
      and p.role::text in ('HEAD_ADMIN','ADMIN')
  ) into v_allowed;

  if not v_allowed then
    return jsonb_build_object(
      'reports', 0,
      'verifications', 0,
      'deletions', 0,
      'group_changes', 0,
      'total', 0
    );
  end if;

  select count(*) into v_reports
  from public.user_reports
  where coalesce(status,'OPEN') not in ('RESOLVED','CLOSED','REJECTED','UNFOUNDED');

  select count(*) into v_verifications
  from public.verification_requests
  where coalesce(status,'PENDING') not in ('APPROVED','REJECTED');

  select count(*) into v_deletions
  from public.account_deletion_requests
  where status in ('PENDING','ON_HOLD','READY_FOR_REVIEW');

  select count(*) into v_group_changes
  from public.community_group_owner_change_requests
  where status = 'PENDING';

  return jsonb_build_object(
    'reports', v_reports,
    'verifications', v_verifications,
    'deletions', v_deletions,
    'group_changes', v_group_changes,
    'total', v_reports + v_verifications + v_deletions + v_group_changes
  );
end;
$$;

revoke all on function public.admin_attention_summary() from public;
revoke all on function public.admin_attention_summary() from anon;
grant execute on function public.admin_attention_summary() to authenticated;
grant execute on function public.admin_attention_summary() to service_role;

drop index if exists public.point_transactions_member_idx;
drop index if exists public.profile_visits_profile_idx;
drop index if exists public.profile_visits_profile_visited_idx;
