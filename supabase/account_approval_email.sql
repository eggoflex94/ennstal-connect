-- Approval emails are queued atomically; external mail never blocks a decision.
create table if not exists private.ec_account_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check(decision in ('APPROVED','CHANGES_REQUIRED')),
  reviewed_at timestamptz not null,
  payload jsonb not null,
  state text not null default 'PENDING' check(state in ('PENDING','SENDING','ACCEPTED','FAILED','CANCELLED')),
  attempts integer not null default 0,
  request_id bigint,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique(user_id,reviewed_at,decision)
);
alter table private.ec_account_email_outbox enable row level security;
revoke all on private.ec_account_email_outbox from public,anon,authenticated;
create index if not exists ec_account_email_pending_idx on private.ec_account_email_outbox(next_attempt_at) where state in ('PENDING','SENDING');

create or replace function private.ec_escape_email_html(value text)
returns text language sql immutable set search_path=pg_catalog as $fn$
  select replace(replace(replace(replace(replace(coalesce(value,''),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')
$fn$;
revoke all on function private.ec_escape_email_html(text) from public,anon,authenticated;

create or replace function private.ec_queue_account_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
declare address text; name text; subject text; message text; html text; field_labels text;
begin
  if new.status not in ('APPROVED','CHANGES_REQUIRED') or new.reviewed_at is null or new.reviewed_at is not distinct from old.reviewed_at then return new; end if;
  select u.email,coalesce(nullif(p.first_name,''),p.nickname,'Mitglied') into address,name
    from auth.users u join public.profiles p on p.id=u.id where u.id=new.user_id;
  if nullif(trim(address),'') is null then return new; end if;
  if new.status='APPROVED' then
    subject:='Dein Account bei Ennstal Connect ist freigegeben';
    message:='Hallo '||name||E',\n\ndein Account wurde vom zuständigen Admin geprüft und freigegeben. Willkommen bei Ennstal Connect!\n\nEine aktive Teilnahme ist ausdrücklich erwünscht: Tausche dich mit anderen aus, entdecke regionale Angebote oder bring dich mit eigenen Beiträgen ein. Eine sinnvolle Aktivität hält unsere Community lebendig.\n\nWichtig: Eine Inaktivität von 30 Tagen führt zur Sperre deines Kontos. Bitte nutze deinen Account regelmäßig.\n\n';
  else
    subject:='Bitte Angaben für deine Account-Freigabe korrigieren';
    select string_agg(case field when 'first_name' then 'Vorname' when 'last_name' then 'Nachname' when 'birth_date' then 'Geburtsdatum' end,', ' order by position)
      into field_labels from unnest(new.required_fields) with ordinality as fields(field,position);
    message:='Hallo '||name||E',\n\nfür die Freigabe deines Accounts sind noch Korrekturen nötig.\n\nBitte korrigiere: '||coalesce(field_labels,'deine Angaben')||E'.\n\nAuflagen des zuständigen Admins:\n'||new.review_note||E'\n\nMelde dich an und reiche die angeforderten Korrekturen im Hinweis zur Account-Freigabe ein. Danach prüft der zuständige Admin deinen Account erneut. Du bleibst angemeldet und kannst die Community weiter nutzen.\n\n';
  end if;
  message:=message||E'Zur Community: https://ennstal-connect.com\n\nDein Ennstal Connect Team';
  html:='<div style="font-family:Arial,sans-serif;background:#f4f7fa;padding:24px"><div style="max-width:600px;margin:auto;background:#fff;padding:28px;border-radius:16px;color:#20364b"><h2 style="color:#db7b32">Ennstal Connect</h2><h3>'||private.ec_escape_email_html(subject)||'</h3><div style="white-space:pre-line;line-height:1.65">'||private.ec_escape_email_html(message)||'</div><p><a href="https://ennstal-connect.com" style="display:inline-block;background:#20364b;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none">Community öffnen</a></p></div></div>';
  insert into private.ec_account_email_outbox(user_id,decision,reviewed_at,payload)
    values(new.user_id,new.status,new.reviewed_at,jsonb_build_object('to',jsonb_build_array(address),'subject',subject,'text',message,'html',html))
    on conflict(user_id,reviewed_at,decision) do nothing;
  return new;
end;
$fn$;
revoke all on function private.ec_queue_account_email() from public,anon,authenticated;
drop trigger if exists ec_queue_account_email on public.account_approvals;
create trigger ec_queue_account_email after update on public.account_approvals for each row execute function private.ec_queue_account_email();

create or replace function public.ec_account_email_status()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if not public.ec_can_review_accounts() then raise exception 'Keine Berechtigung für den Freigabe-Mailstatus.'; end if;
  return jsonb_build_object('configured',exists(select 1 from vault.decrypted_secrets where name='ec_brevo_api_key' and nullif(trim(decrypted_secret),'') is not null) and exists(select 1 from vault.decrypted_secrets where name='ec_mail_from' and nullif(trim(decrypted_secret),'') is not null),
    'pending',(select count(*) from private.ec_account_email_outbox where public.ec_can_review_account(user_id) and state in ('PENDING','SENDING')),
    'failed',(select count(*) from private.ec_account_email_outbox where public.ec_can_review_account(user_id) and state='FAILED'),
    'accepted',(select count(*) from private.ec_account_email_outbox where public.ec_can_review_account(user_id) and state='ACCEPTED'));
end;
$fn$;
revoke all on function public.ec_account_email_status() from public,anon;
grant execute on function public.ec_account_email_status() to authenticated;
