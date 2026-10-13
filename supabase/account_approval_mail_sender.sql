-- Resend explicitly authorized by the owner. Only the main head admin can configure it.
create extension if not exists pg_net with schema extensions;
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;

create or replace function public.ec_configure_account_email(p_api_key text,p_sender text)
returns void language plpgsql security definer set search_path=public,pg_temp as $fn$
declare secret_id uuid;
begin
  if auth.uid() is null or not public.ec_is_head_admin() then raise exception 'Nur der Hauptadmin darf den Mailversand einrichten.'; end if;
  if coalesce(p_api_key,'') !~ '^re_[A-Za-z0-9_-]{10,200}$' then raise exception 'Bitte einen gültigen Resend API-Key eingeben.'; end if;
  p_sender:=trim(coalesce(p_sender,''));
  if length(p_sender)>254 or p_sender !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then raise exception 'Bitte eine bestätigte Absender-E-Mail-Adresse angeben.'; end if;
  select id into secret_id from vault.secrets where name='ec_resend_api_key' limit 1;
  if secret_id is null then perform vault.create_secret(p_api_key,'ec_resend_api_key'); else perform vault.update_secret(secret_id,p_api_key); end if;
  select id into secret_id from vault.secrets where name='ec_mail_from' limit 1;
  if secret_id is null then perform vault.create_secret(p_sender,'ec_mail_from'); else perform vault.update_secret(secret_id,p_sender); end if;
  insert into public.admin_log(actor_id,action,details) values(auth.uid(),'ACCOUNT_EMAIL_CONFIGURED',jsonb_build_object('provider','Resend'));
end;
$fn$;
revoke all on function public.ec_configure_account_email(text,text) from public,anon;
grant execute on function public.ec_configure_account_email(text,text) to authenticated;

create or replace function private.ec_process_account_emails()
returns void language plpgsql security definer set search_path=public,pg_temp as $fn$
declare api_key text; sender text; item record; response record; request bigint; provider_id_value text;
begin
  if not pg_try_advisory_xact_lock(hashtext('ec-account-email-worker')) then return; end if;
  for item in select * from private.ec_account_email_outbox where state='SENDING' for update loop
    select * into response from net._http_response where id=item.request_id;
    if found then
      provider_id_value:=null;
      if response.status_code between 200 and 299 then
        begin provider_id_value:=(response.content::jsonb)->>'id'; exception when others then provider_id_value:=null; end;
      end if;
      if provider_id_value is not null then
        update private.ec_account_email_outbox set state='ACCEPTED',provider_id=provider_id_value,last_error=null where id=item.id;
      else
        update private.ec_account_email_outbox set state=case when attempts>=8 or (response.status_code between 400 and 499 and response.status_code not in (408,409,429)) then 'FAILED' else 'PENDING' end,
          last_error=case when response.timed_out then 'Zeitüberschreitung beim Maildienst' else 'Maildienst HTTP '||coalesce(response.status_code::text,'ohne Antwort') end,
          next_attempt_at=now()+make_interval(mins=>least(60,power(2,item.attempts)::int)) where id=item.id;
      end if;
    elsif item.last_attempt_at<now()-interval '5 minutes' then
      update private.ec_account_email_outbox set state=case when attempts>=8 then 'FAILED' else 'PENDING' end,last_error='Keine Versandantwort',next_attempt_at=now()+interval '5 minutes' where id=item.id;
    end if;
  end loop;
  -- Resend retains idempotency keys for 24 hours; stop before that boundary.
  update private.ec_account_email_outbox set state='FAILED',last_error='Versand unklar; keine automatische Wiederholung nach 23 Stunden' where state='PENDING' and first_attempt_at<now()-interval '23 hours';
  update private.ec_account_email_outbox o set state='CANCELLED',last_error='Prüfstatus wurde inzwischen geändert'
    where o.state='PENDING' and not exists(select 1 from public.account_approvals a where a.user_id=o.user_id and a.status=o.decision and a.reviewed_at=o.reviewed_at);
  -- Bound retention independently of whether credentials have been configured.
  delete from private.ec_account_email_outbox where state in ('ACCEPTED','CANCELLED') and created_at<now()-interval '30 days';
  select decrypted_secret into api_key from vault.decrypted_secrets where name='ec_resend_api_key' limit 1;
  select decrypted_secret into sender from vault.decrypted_secrets where name='ec_mail_from' limit 1;
  if nullif(trim(api_key),'') is null or nullif(trim(sender),'') is null then return; end if;
  for item in select * from private.ec_account_email_outbox where state='PENDING' and next_attempt_at<=now() order by created_at limit 1 for update skip locked loop
    update private.ec_account_email_outbox set payload=case when payload ? 'from' then payload else payload||jsonb_build_object('from','Ennstal Connect <'||sender||'>') end where id=item.id returning * into item;
    request:=net.http_post(url:='https://api.resend.com/emails',headers:=jsonb_build_object('Authorization','Bearer '||api_key,'Content-Type','application/json','Idempotency-Key','ec-account/'||item.id::text),body:=item.payload,timeout_milliseconds:=15000);
    update private.ec_account_email_outbox set state='SENDING',request_id=request,attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now() where id=item.id;
  end loop;
end;
$fn$;
revoke all on function private.ec_process_account_emails() from public,anon,authenticated;
select cron.schedule('ec-account-approval-emails','* * * * *','select private.ec_process_account_emails();');

create or replace function public.ec_account_email_status()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if auth.uid() is null or not public.ec_is_head_admin() then raise exception 'Nur der Hauptadmin darf den Mailstatus sehen.'; end if;
  return jsonb_build_object('configured',exists(select 1 from vault.decrypted_secrets where name='ec_resend_api_key' and nullif(trim(decrypted_secret),'') is not null) and exists(select 1 from vault.decrypted_secrets where name='ec_mail_from' and nullif(trim(decrypted_secret),'') is not null),
    'pending',(select count(*) from private.ec_account_email_outbox where state in ('PENDING','SENDING')),
    'failed',(select count(*) from private.ec_account_email_outbox where state='FAILED'),
    'accepted',(select count(*) from private.ec_account_email_outbox where state='ACCEPTED'));
end;
$fn$;
revoke all on function public.ec_account_email_status() from public,anon;
grant execute on function public.ec_account_email_status() to authenticated;
