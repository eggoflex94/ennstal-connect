-- Every change rolls back. Mock HTTP replies only; no external emails are sent.
begin;
do $test$
declare h uuid; m uuid; mail_id uuid; stamp timestamptz; request bigint; code integer; blocked boolean; request_body jsonb;
begin
  select id into h from public.profiles where role::text='HEAD_ADMIN' and is_primary_head_admin and account_status='ACTIVE' limit 1;
  select p.id into m from public.profiles p join auth.users u on u.id=p.id where p.role::text='MEMBER' and p.account_status='ACTIVE' and u.email is not null limit 1;
  if h is null or m is null then raise exception 'Test prerequisites missing'; end if;
  foreach code in array array[200,429,401] loop
    stamp:=clock_timestamp();
    update public.account_approvals set status='APPROVED',reviewed_at=stamp where user_id=m;
    select id into mail_id from private.ec_account_email_outbox where user_id=m and reviewed_at=stamp and decision='APPROVED';
    request:=-(extract(epoch from clock_timestamp())*1000000)::bigint;
    update private.ec_account_email_outbox set state='SENDING',request_id=request,attempts=1,first_attempt_at=now(),last_attempt_at=now() where id=mail_id;
    insert into net._http_response(id,status_code,content,timed_out,created) values(request,code,case when code=200 then '{"messageId":"mock-provider-id"}' else '{}' end,false,now());
    perform private.ec_process_account_emails();
    if code=200 and not exists(select 1 from private.ec_account_email_outbox where id=mail_id and state='ACCEPTED' and provider_id='mock-provider-id') then raise exception 'Successful response not recorded'; end if;
    if code=429 and not exists(select 1 from private.ec_account_email_outbox where id=mail_id and state='PENDING' and next_attempt_at>now()) then raise exception 'Rate limit retry not deferred'; end if;
    if code=401 and not exists(select 1 from private.ec_account_email_outbox where id=mail_id and state='FAILED') then raise exception 'Permanent rejection not stopped'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub',m::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  blocked:=false;
  begin perform public.ec_configure_account_email('xkeysib-01234567890123456789TEST','test@example.invalid'); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Member could configure mail'; end if;
  perform set_config('request.jwt.claim.sub',h::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  perform public.ec_configure_account_email('xkeysib-01234567890123456789TEST','test@example.invalid');
  if not (public.ec_account_email_status()->>'configured')::boolean then raise exception 'Head admin configuration not recognized'; end if;
  execute 'set local role postgres';
  stamp:=clock_timestamp();
  update public.account_approvals set status='APPROVED',reviewed_at=stamp where user_id=m;
  select id into mail_id from private.ec_account_email_outbox where user_id=m and reviewed_at=stamp and decision='APPROVED';
  perform private.ec_process_account_emails();
  select convert_from(q.body,'UTF8')::jsonb into request_body from net.http_request_queue q
    join private.ec_account_email_outbox o on o.request_id=q.id where o.id=mail_id and q.url='https://api.brevo.com/v3/smtp/email';
  if request_body is null or request_body->'sender'->>'email'<>'test@example.invalid'
    or request_body->'headers'->>'idempotencyKey'<>mail_id::text or request_body->'to'->0->>'email' is null
    or nullif(request_body->>'htmlContent','') is null then raise exception 'Brevo request format or deduplication key incorrect'; end if;
  if exists(select 1 from public.admin_log where action='ACCOUNT_EMAIL_CONFIGURED' and details::text like '%0123456789TEST%') then raise exception 'API key logged'; end if;
end;
$test$;
rollback;
select 'Mock acceptance, rate-limit retry, rejection and private configuration passed; test rolled back.' as result;
