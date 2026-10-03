-- Record rejected privileged/admin attempts in the same Head-Admin logbook.
create or replace function public.log_admin_denied_action(
  p_action_name text,
  p_target_id uuid default null,
  p_error text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Nicht eingeloggt.';
  end if;

  select role::text into v_role
  from public.profiles
  where id = v_actor and account_status::text = 'ACTIVE';

  if upper(coalesce(v_role,'')) not in ('HEAD_ADMIN','ADMIN','SUPPORTER') then
    raise exception 'Nur Teammitglieder dürfen Admin-Ablehnungen protokollieren.';
  end if;

  insert into public.admin_log(id,actor_id,action,target_id,details,created_at)
  values(
    v_id,
    v_actor,
    'ADMIN_DENIED',
    p_target_id,
    jsonb_build_object(
      'action_name', left(coalesce(nullif(btrim(p_action_name),''),'Admin-Aktion'),120),
      'reason', 'Abgelehnte Admin-Aktion',
      'error', left(coalesce(p_error,'Keine Berechtigung.'),500),
      'outcome', 'DENIED',
      'actor_role', v_role,
      'context', coalesce(p_context,'{}'::jsonb)
    ),
    now()
  );

  return v_id;
end;
$$;

revoke all on function public.log_admin_denied_action(text,uuid,text,jsonb) from public;
grant execute on function public.log_admin_denied_action(text,uuid,text,jsonb) to authenticated;

create index if not exists admin_log_action_created_idx
  on public.admin_log(action,created_at desc);
