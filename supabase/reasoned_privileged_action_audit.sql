-- Mandatory reasons and readable audit entries for privileged actions.
-- Apply after comprehensive_privileged_action_audit.sql.

create table if not exists public.pending_privileged_actions (
  actor_id uuid primary key references public.profiles(id) on delete cascade,
  action_key uuid not null default gen_random_uuid(),
  action_name text not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 1000),
  target_id uuid null,
  actor_role text not null,
  prepared_at timestamptz not null default now()
);

alter table public.pending_privileged_actions enable row level security;
revoke all on table public.pending_privileged_actions from public, anon, authenticated;

create or replace function public.prepare_privileged_action(
  p_action_name text,
  p_reason text,
  p_target_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_key uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Nicht eingeloggt.'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'Eine Begründung mit mindestens 5 Zeichen ist verpflichtend.';
  end if;
  select role::text into v_role from public.profiles
  where id=auth.uid() and account_status::text='ACTIVE';
  if v_role not in ('HEAD_ADMIN','ADMIN','SUPPORTER') then
    raise exception 'Diese Funktion ist nur für Admins und Supporter verfügbar.';
  end if;
  insert into public.pending_privileged_actions(actor_id,action_key,action_name,reason,target_id,actor_role,prepared_at)
  values(auth.uid(),v_key,left(btrim(p_action_name),120),btrim(p_reason),p_target_id,v_role,now())
  on conflict(actor_id) do update set
    action_key=excluded.action_key, action_name=excluded.action_name,
    reason=excluded.reason, target_id=excluded.target_id,
    actor_role=excluded.actor_role, prepared_at=excluded.prepared_at;
  return v_key;
end;
$$;
revoke all on function public.prepare_privileged_action(text,text,uuid) from public,anon;
grant execute on function public.prepare_privileged_action(text,text,uuid) to authenticated;

create or replace function public.ec_audit_privileged_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_context public.pending_privileged_actions%rowtype;
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_row jsonb;
  v_changed text[];
  v_target uuid;
  v_existing uuid;
  v_change jsonb;
begin
  if v_actor is null then return coalesce(new,old); end if;
  select * into v_context from public.pending_privileged_actions
  where actor_id=v_actor and prepared_at > now()-interval '3 minutes';
  if not found then return coalesce(new,old); end if;

  v_row := case when tg_op='DELETE' then v_old else v_new end;
  if tg_op='UPDATE' then
    select coalesce(array_agg(n.key order by n.key),'{}'::text[]) into v_changed
    from jsonb_each(v_new) n
    where v_old->n.key is distinct from n.value
      and n.key not in ('content','body','message','warning_text','admin_note',
        'updated_at','last_active_at','last_online_at','is_online',
        'total_online_seconds','last_reward_seconds','reward_level');
    if coalesce(array_length(v_changed,1),0)=0 then return coalesce(new,old); end if;
  end if;

  v_target := v_context.target_id;
  v_change := jsonb_strip_nulls(jsonb_build_object(
    'area',tg_table_name,'operation',tg_op,'record_id',v_row->>'id',
    'changed_fields',case when tg_op='UPDATE' then to_jsonb(v_changed) else null end));

  select id into v_existing from public.admin_log
  where actor_id=v_actor and details->>'action_key'=v_context.action_key::text
  order by created_at desc limit 1;
  if v_existing is null then
    insert into public.admin_log(actor_id,action,target_id,details)
    values(v_actor,'ADMIN_'||tg_op,v_target,jsonb_build_object(
      'action_key',v_context.action_key,'action_name',v_context.action_name,
      'reason',v_context.reason,'actor_role',v_context.actor_role,
      'changes',jsonb_build_array(v_change)));
  else
    update public.admin_log set details=jsonb_set(details,'{changes}',
      coalesce(details->'changes','[]'::jsonb)||jsonb_build_array(v_change))
    where id=v_existing;
  end if;
  return coalesce(new,old);
end;
$$;
revoke all on function public.ec_audit_privileged_change() from public,anon,authenticated;

create or replace function public.ec_log(
  p_action text,
  p_target uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_context public.pending_privileged_actions%rowtype;
  v_existing uuid;
begin
  select * into v_context from public.pending_privileged_actions
  where actor_id=auth.uid() and prepared_at > now()-interval '3 minutes';
  if found then
    select id into v_existing from public.admin_log
    where actor_id=auth.uid() and details->>'action_key'=v_context.action_key::text
    order by created_at desc limit 1;
    if v_existing is null then
      insert into public.admin_log(actor_id,action,target_id,details)
      values(auth.uid(),p_action,coalesce(p_target,v_context.target_id),
        coalesce(p_details,'{}'::jsonb)||jsonb_build_object(
          'action_key',v_context.action_key,'action_name',v_context.action_name,
          'reason',v_context.reason,'actor_role',v_context.actor_role));
    else
      update public.admin_log set action=p_action,
        target_id=coalesce(p_target,target_id),
        details=details||coalesce(p_details,'{}'::jsonb)
      where id=v_existing;
    end if;
  end if;
end;
$$;

create or replace function public.get_admin_log(p_limit integer default 500)
returns table(id uuid,actor_id uuid,action text,target_id uuid,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.ec_is_head_admin() then raise exception 'Nur der Global Admin darf das Logbuch sehen.'; end if;
  return query
  select l.id,l.actor_id,l.action,l.target_id,l.details,l.created_at
  from public.admin_log l
  where l.action not like 'PRIVILEGED_%'
     or nullif(l.details->>'reason','') is not null
  order by l.created_at desc
  limit greatest(1,least(coalesce(p_limit,500),2000));
end;
$$;
revoke all on function public.get_admin_log(integer) from public,anon;
grant execute on function public.get_admin_log(integer) to authenticated;

notify pgrst,'reload schema';
