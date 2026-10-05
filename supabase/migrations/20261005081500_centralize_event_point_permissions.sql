-- Centralize event-point permissions without removing any existing feature.
-- Rules:
-- * ADMIN and HEAD_ADMIN may award positive event points.
-- * A non-primary HEAD_ADMIN may receive positive event points only from another HEAD_ADMIN.
-- * The primary HEAD_ADMIN remains protected.
-- * Self-awards are not allowed.
-- * Existing award_event_points RPC remains the public entry point.

create or replace function public.ec_can_award_event_points(
  p_actor uuid,
  p_target uuid,
  p_amount integer
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_actor is not null
    and p_target is not null
    and p_actor <> p_target
    and p_amount between 1 and 100
    and exists (
      select 1
      from public.profiles actor
      join public.profiles target on target.id = p_target
      where actor.id = p_actor
        and actor.account_status = 'ACTIVE'
        and target.account_status = 'ACTIVE'
        and upper(actor.role::text) in ('ADMIN','HEAD_ADMIN')
        and coalesce(target.is_primary_head_admin,false) = false
        and (
          upper(target.role::text) <> 'HEAD_ADMIN'
          or upper(actor.role::text) = 'HEAD_ADMIN'
        )
    );
$$;

revoke all on function public.ec_can_award_event_points(uuid,uuid,integer) from public, anon;
grant execute on function public.ec_can_award_event_points(uuid,uuid,integer) to authenticated;

create or replace function public.award_event_points(
  p_event_id uuid,
  p_recipient_id uuid,
  p_amount integer,
  p_reason text default 'Punkte für Event'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
  v_recipient_role text;
  v_recipient_primary boolean := false;
  v_event_title text;
  v_reason text := btrim(coalesce(p_reason,''));
  v_award_id uuid;
  v_balance integer;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Nicht angemeldet'; end if;
  if p_event_id is null or p_recipient_id is null then raise exception 'Event und Empfänger sind erforderlich'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100 then raise exception 'Punkte müssen zwischen 1 und 100 liegen'; end if;

  select role::text, coalesce(nullif(nickname,''),'Admin')
    into v_actor_role, v_actor_name
  from public.profiles
  where id=v_actor and account_status='ACTIVE';
  if not found then raise exception 'Aktives Adminprofil nicht gefunden'; end if;

  select role::text, coalesce(is_primary_head_admin,false)
    into v_recipient_role, v_recipient_primary
  from public.profiles
  where id=p_recipient_id and account_status='ACTIVE';
  if not found then raise exception 'Empfänger nicht gefunden'; end if;

  if not public.ec_can_award_event_points(v_actor,p_recipient_id,p_amount) then
    if p_recipient_id = v_actor then
      raise exception 'Eigene Eventpunkte können hier nicht vergeben werden';
    elsif v_recipient_primary then
      raise exception 'Der primäre Head Admin ist gegen administrative Punkteänderungen geschützt';
    elsif upper(coalesce(v_recipient_role,''))='HEAD_ADMIN'
       and upper(coalesce(v_actor_role,''))<>'HEAD_ADMIN' then
      raise exception 'Nur Head Admins dürfen einem anderen Head Admin Eventpunkte vergeben';
    else
      raise exception 'Keine Berechtigung für diese Eventpunkte-Vergabe';
    end if;
  end if;

  select title into v_event_title
  from public.community_events
  where id=p_event_id;
  if not found then raise exception 'Event nicht gefunden'; end if;

  if v_reason='' then
    v_reason := 'Punkte für Event · ' || v_event_title;
  end if;

  if upper(coalesce(v_recipient_role,''))='HEAD_ADMIN' then
    update public.profiles
    set points=coalesce(points,0)+p_amount,
        updated_at=now()
    where id=p_recipient_id
    returning points into v_balance;

    insert into public.point_transactions(
      member_id,actor_id,kind,amount,reason,category,source_type,source_id,automated
    )
    values(
      p_recipient_id,v_actor,'PLUS'::public.point_kind,p_amount,v_reason,
      'EVENT_REWARD','EVENT_REWARD',p_event_id,false
    );

    insert into public.point_history(user_id,amount,delta,reason,changed_by)
    values(p_recipient_id,p_amount,p_amount,v_reason,v_actor);

    insert into public.messages(sender_id,receiver_id,content,is_read,message_type,points_delta)
    values(
      v_actor,p_recipient_id,
      'Du hast soeben von '||v_actor_name||' +'||p_amount||
      ' Eventpunkte erhalten.'||E'\nGrund: '||v_reason,
      false,'POINTS',p_amount
    );

    insert into public.admin_logs(actor_id,action,target_type,target_id,details)
    values(
      v_actor,'POINTS_AWARDED','PROFILE',p_recipient_id,
      jsonb_build_object(
        'delta',p_amount,
        'category','EVENT_REWARD',
        'reason',v_reason,
        'source_type','EVENT_REWARD',
        'source_id',p_event_id,
        'target_role',v_recipient_role
      )
    );

    v_result := jsonb_build_object(
      'member_id',p_recipient_id,
      'delta',p_amount,
      'manual_balance',v_balance,
      'category','EVENT_REWARD',
      'awarded_by_nickname',v_actor_name,
      'awarded_by_role','Head Admin'
    );
  else
    v_result := public.award_member_points(
      p_recipient_id,
      p_amount,
      v_reason,
      'EVENT_REWARD',
      true,
      'EVENT_REWARD',
      p_event_id
    );
  end if;

  insert into public.event_point_awards(event_id,recipient_id,actor_id,amount,reason)
  values(p_event_id,p_recipient_id,v_actor,p_amount,v_reason)
  returning id into v_award_id;

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('event_award_id',v_award_id,'event_id',p_event_id);
end;
$function$;

revoke all on function public.award_event_points(uuid,uuid,integer,text) from public, anon;
grant execute on function public.award_event_points(uuid,uuid,integer,text) to authenticated;
