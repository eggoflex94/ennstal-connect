create or replace function public.ec_request_reactivation()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  requester uuid := (select auth.uid());
  recipients integer;
begin
  if requester is null then raise exception 'Bitte zuerst anmelden.'; end if;
  if not exists (select 1 from public.profiles where id=requester and (account_status='SUSPENDED' or is_suspended is true)) then
    raise exception 'Nur gesperrte Konten koennen eine Reaktivierung anfordern.';
  end if;
  if exists (select 1 from public.messages where sender_id=requester and message_type='REACTIVATION_REQUEST' and created_at > now()-interval '7 days') then
    return 'already_requested';
  end if;
  insert into public.messages(sender_id,receiver_id,content,message_type,is_read)
  select requester,p.id,'Bitte um Reaktivierung meines gesperrten Kontos. Ich bitte um Pruefung und Freigabe. Mitglied-ID: '||requester::text,'REACTIVATION_REQUEST',false
  from public.profiles p where p.role::text='HEAD_ADMIN' and p.account_status='ACTIVE' and p.id<>requester;
  get diagnostics recipients = row_count;
  if recipients=0 then raise exception 'Kein aktiver Head Admin verfuegbar.'; end if;
  return 'requested';
end;
$$;
revoke all on function public.ec_request_reactivation() from public, anon;
grant execute on function public.ec_request_reactivation() to authenticated;
