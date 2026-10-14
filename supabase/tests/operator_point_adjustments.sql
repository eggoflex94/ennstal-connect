begin;
do $test$
declare h uuid; d uuid; actor record; failed boolean; result jsonb;
begin
  select id into h from public.profiles where is_primary_head_admin and role::text='HEAD_ADMIN' and account_status='ACTIVE' limit 1;
  select id into d from public.profiles where not is_primary_head_admin and role::text='HEAD_ADMIN' and account_status='ACTIVE' limit 1;
  if h is null or d is null then raise exception 'Operator and delegated head required'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.award_member_points(d,7,'','ADMIN_ADJUSTMENT',false,null,null);
  result:=public.award_member_points(d,-7,'Test: optionaler Grund','ADMIN_ADJUSTMENT',false,null,null);
  perform public.admin_change_points(d,3,'PLUS','');
  perform public.admin_change_points(d,-3,'MINUS','Test: Legacy-Pfad');
  execute 'set local role postgres';
  for actor in select id from public.profiles where id<>h and account_status='ACTIVE' and (role::text in ('HEAD_ADMIN','ADMIN') or exists(select 1 from public.regional_admin_assignments r where r.user_id=profiles.id and r.active)) loop
    perform set_config('request.jwt.claim.sub',actor.id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    failed:=false; begin perform public.award_member_points(h,1,'Test: Betreiber schützen','ADMIN_ADJUSTMENT',false,null,null); exception when others then failed:=true; end;
    if not failed then raise exception 'Other admin can award operator'; end if;
    failed:=false; begin perform public.award_member_points(h,-1,'Test: Betreiber schützen','ADMIN_ADJUSTMENT',false,null,null); exception when others then failed:=true; end;
    if not failed then raise exception 'Other admin can deduct operator'; end if;
    failed:=false; begin perform public.admin_change_points(h,1,'PLUS','Test: Betreiber schützen'); exception when others then failed:=true; end;
    if not failed then raise exception 'Legacy protection bypass'; end if;
    execute 'set local role postgres';
    failed:=false; begin update public.profiles set points=coalesce(points,0)+1 where id=h; exception when others then failed:=true; end;
    if not failed then raise exception 'Direct protection bypass'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',h::text,true);
  failed:=false; begin update public.profiles set avatar_url='https://example.invalid/test' where id=d; exception when others then failed:=true; end;
  if not failed then raise exception 'Point exception unlocked media'; end if;
  failed:=false; begin update public.profiles set purchase_points=purchase_points+10000 where id=d; exception when others then failed:=true; end;
  if not failed then raise exception 'Arbitrary wallet update allowed'; end if;
end;
$test$;
rollback;
select 'Operator plus/minus, optional reason, legacy entry and protection against all other admins passed; test rolled back.' as result;
