-- Region and role authorization test; all decisions/notifications roll back.
begin;
do $test$
declare h uuid; r uuid; g uuid; region uuid; inside_member uuid; outside_member uuid; denied boolean; queue jsonb; item jsonb;
begin
  select id into h from public.profiles where role::text='HEAD_ADMIN' and not is_primary_head_admin and account_status='ACTIVE' limit 1;
  select p.id,a.region_id into r,region from public.profiles p join public.regional_admin_assignments a on a.user_id=p.id and a.active
    where p.account_status='ACTIVE' and p.role::text not in ('HEAD_ADMIN','ADMIN') limit 1;
  select id into g from public.profiles where role::text='ADMIN' and account_status='ACTIVE' limit 1;
  select id into inside_member from public.profiles where home_region_id=region and account_status='ACTIVE' and role::text='MEMBER' and id<>r limit 1;
  select id into outside_member from public.profiles where home_region_id<>region and account_status='ACTIVE' and role::text='MEMBER' and id<>r limit 1;
  if h is null or r is null or g is null or inside_member is null or outside_member is null then raise exception 'Test requires delegated head, regional/global admin, members in two regions'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not public.ec_can_review_accounts() or not public.ec_can_review_account(outside_member) then raise exception 'Second head admin access missing'; end if;
  perform public.ec_set_account_review_permission(g,false);
  perform public.ec_review_account_approval(inside_member,'CHANGES_REQUIRED',array['first_name'],'Test: Bitte den vollständigen Vornamen prüfen.');
  perform set_config('request.jwt.claim.sub',r::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',r,'role','authenticated')::text,true);
  if not public.ec_can_review_accounts() or not public.ec_can_review_account(inside_member) or public.ec_can_review_account(outside_member) then raise exception 'Regional access boundaries incorrect'; end if;
  queue:=public.ec_account_approval_queue('ALL');
  for item in select jsonb_array_elements(queue->'items') loop
    if not public.ec_can_review_account((item->>'user_id')::uuid) then raise exception 'Queue exposes another region'; end if;
  end loop;
  if exists(select 1 from public.account_approvals where user_id=outside_member) then raise exception 'RLS exposes another region'; end if;
  denied:=false; begin perform public.ec_review_account_approval(outside_member,'CHANGES_REQUIRED',array['last_name'],'Test: Nachnamen prüfen.'); exception when others then denied:=true; end;
  if not denied then raise exception 'Regional reviewer changed another region'; end if;
  denied:=false; begin perform public.ec_set_account_review_permission(g,true); exception when others then denied:=true; end;
  if not denied then raise exception 'Regional admin granted global review permission'; end if;
  perform public.ec_review_account_approval(inside_member,'CHANGES_REQUIRED',array['last_name'],'Test: Bitte den vollständigen Nachnamen prüfen.');
  perform set_config('request.jwt.claim.sub',g::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g,'role','authenticated')::text,true);
  if public.ec_can_review_accounts() then raise exception 'Global admin has review access without permission'; end if;
  denied:=false; begin perform public.ec_account_approval_queue(); exception when others then denied:=true; end;
  if not denied then raise exception 'Unapproved global admin reads queue'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  perform public.ec_set_account_review_permission(g,true);
  perform set_config('request.jwt.claim.sub',g::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g,'role','authenticated')::text,true);
  if not public.ec_can_review_accounts() or not public.ec_can_review_account(inside_member) or not public.ec_can_review_account(outside_member) then raise exception 'Authorized global admin cannot review all regions'; end if;
  perform public.ec_review_account_approval(outside_member,'CHANGES_REQUIRED',array['last_name'],'Test: Bitte den vollständigen Nachnamen prüfen.');
  denied:=false; begin perform public.ec_set_account_review_permission(g,true); exception when others then denied:=true; end;
  if not denied then raise exception 'Global admin can approve its own permission'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  perform public.ec_set_account_review_permission(g,false);
  perform set_config('request.jwt.claim.sub',g::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g,'role','authenticated')::text,true);
  if public.ec_can_review_accounts() then raise exception 'Revocation did not take effect'; end if;
end;
$test$;
rollback;
select 'Second head, regional isolation, explicit global grant, revocation and self-grant denial passed; test rolled back.' as result;
