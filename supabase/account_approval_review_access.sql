-- Explicit review permissions, independent of all other admin privileges.
create table if not exists private.ec_global_account_review_grants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table private.ec_global_account_review_grants enable row level security;
revoke all on private.ec_global_account_review_grants from public,anon,authenticated;

create or replace function public.ec_can_review_accounts()
returns boolean language sql stable security definer set search_path=public,pg_temp as $fn$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.account_status='ACTIVE' and
    case when p.role::text='HEAD_ADMIN' then true
      when p.role::text='ADMIN' then exists(select 1 from private.ec_global_account_review_grants g where g.user_id=p.id)
      else exists(select 1 from public.regional_admin_assignments r where r.user_id=p.id and r.active) end)
$fn$;
revoke all on function public.ec_can_review_accounts() from public,anon;
grant execute on function public.ec_can_review_accounts() to authenticated;

create or replace function public.ec_can_review_account(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $fn$
  select exists(select 1 from public.profiles actor join public.profiles target on target.id=p_user_id
    where actor.id=auth.uid() and actor.account_status='ACTIVE' and target.account_status='ACTIVE' and target.role::text<>'HEAD_ADMIN' and
    case when actor.role::text='HEAD_ADMIN' then true
      when actor.role::text='ADMIN' then exists(select 1 from private.ec_global_account_review_grants g where g.user_id=actor.id)
      else exists(select 1 from public.regional_admin_assignments r where r.user_id=actor.id and r.region_id=target.home_region_id and r.active) end)
$fn$;
revoke all on function public.ec_can_review_account(uuid) from public,anon;
grant execute on function public.ec_can_review_account(uuid) to authenticated;

create or replace function public.ec_account_review_permissions()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role::text='HEAD_ADMIN' and account_status='ACTIVE') then raise exception 'Nur Hauptadmins dürfen Freigabe-Rechte verwalten.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'nickname',p.nickname,'allowed',g.user_id is not null) order by p.nickname)
    from public.profiles p left join private.ec_global_account_review_grants g on g.user_id=p.id where p.role::text='ADMIN' and p.account_status='ACTIVE'),'[]'::jsonb);
end;
$fn$;
revoke all on function public.ec_account_review_permissions() from public,anon;
grant execute on function public.ec_account_review_permissions() to authenticated;

create or replace function public.ec_set_account_review_permission(p_user_id uuid,p_allowed boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role::text='HEAD_ADMIN' and account_status='ACTIVE') then raise exception 'Nur Hauptadmins dürfen Freigabe-Rechte vergeben.'; end if;
  perform 1 from public.profiles where id=p_user_id and role::text='ADMIN' and account_status='ACTIVE' for update;
  if not found or p_allowed is null then raise exception 'Bitte einen aktiven Global Admin auswählen.'; end if;
  if p_allowed then
    insert into private.ec_global_account_review_grants(user_id,granted_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
  else delete from private.ec_global_account_review_grants where user_id=p_user_id; end if;
  insert into public.admin_log(actor_id,action,target_id,details) values(auth.uid(),'ACCOUNT_REVIEW_PERMISSION',p_user_id,jsonb_build_object('allowed',p_allowed));
end;
$fn$;
revoke all on function public.ec_set_account_review_permission(uuid,boolean) from public,anon;
grant execute on function public.ec_set_account_review_permission(uuid,boolean) to authenticated;

drop policy if exists account_approvals_read on public.account_approvals;
create policy account_approvals_read on public.account_approvals for select to authenticated
  using (user_id=(select auth.uid()) or public.ec_can_review_account(user_id));

create or replace function public.ec_account_approval_queue(p_status text default 'OPEN',p_query text default '',p_limit int default 50,p_offset int default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare result jsonb;
begin
  if auth.uid() is null or not public.ec_can_review_accounts() then raise exception 'Keine Berechtigung zur Account-Prüfung.'; end if;
  if p_status not in ('OPEN','PENDING','CHANGES_REQUIRED','APPROVED','LEGACY_ACTIVE','ALL') then raise exception 'Ungültiger Filter.'; end if;
  with selected as (
    select a.*,p.nickname,p.first_name,p.last_name,p.birth_date,p.home_region_id,p.created_at as registered_at
    from public.account_approvals a join public.profiles p on p.id=a.user_id
    where p.account_status='ACTIVE' and p.role::text<>'HEAD_ADMIN' and public.ec_can_review_account(p.id)
    and (p_status='ALL' or (p_status='OPEN' and a.status in ('PENDING','CHANGES_REQUIRED')) or a.status=p_status)
    and (coalesce(trim(p_query),'')='' or concat_ws(' ',p.nickname,p.first_name,p.last_name) ilike '%'||left(trim(p_query),100)||'%')
  ) select jsonb_build_object('total',(select count(*) from selected),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (
    select * from selected order by created_at,user_id limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset)
  ) r),'[]'::jsonb)) into result;
  return result;
end;
$fn$;

create or replace function public.ec_review_account_approval(p_user_id uuid,p_decision text,p_fields text[] default '{}',p_note text default '',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare a public.account_approvals%rowtype; p public.profiles%rowtype;
begin
  if auth.uid() is null or not public.ec_can_review_accounts() then raise exception 'Keine Berechtigung zur Account-Freigabe.'; end if;
  if not public.ec_can_review_account(p_user_id) then raise exception 'Keine Freigabe-Berechtigung für diese Region oder diesen Account.'; end if;
  if p_user_id=auth.uid() then raise exception 'Das eigene Konto kann hier nicht geprüft werden.'; end if;
  if p_decision not in ('APPROVED','CHANGES_REQUIRED') then raise exception 'Ungültige Entscheidung.'; end if;
  select * into a from public.account_approvals where user_id=p_user_id for update;
  if not found then raise exception 'Kein Account zur Prüfung gefunden.'; end if;
  if p_expected_updated_at is not null and a.updated_at is distinct from p_expected_updated_at then raise exception 'Der Account wurde inzwischen geändert. Bitte neu laden.'; end if;
  select * into p from public.profiles where id=p_user_id;
  if p.account_status<>'ACTIVE' or p.role::text='HEAD_ADMIN' then raise exception 'Dieses Konto wird hier nicht freigegeben.'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Die Notiz darf höchstens 1000 Zeichen haben.'; end if;
  if p_decision='CHANGES_REQUIRED' and (cardinality(coalesce(p_fields,'{}'))=0 or not p_fields <@ array['first_name','last_name','birth_date']::text[] or length(trim(coalesce(p_note,'')))<10) then
    raise exception 'Bitte mindestens eine Korrektur und eine verständliche Notiz mit 10 Zeichen angeben.';
  end if;
  if p_decision='APPROVED' and (not private.ec_account_names_valid(p.first_name,p.last_name,p.birth_date) or p.birth_date>current_date or p.birth_date<current_date-interval '130 years') then
    raise exception 'Vorname, Nachname und Geburtsdatum müssen korrekt ausgefüllt sein. Bitte Auflagen setzen.';
  end if;
  if a.status=p_decision and a.review_note=trim(coalesce(p_note,''))
    and a.required_fields=(case when p_decision='APPROVED' then '{}'::text[] else p_fields end) then return to_jsonb(a); end if;
  update public.account_approvals set status=p_decision,required_fields=case when p_decision='APPROVED' then '{}'::text[] else p_fields end,
    review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),approved_at=case when p_decision='APPROVED' then now() else null end,updated_at=clock_timestamp()
    where user_id=p_user_id returning * into a;
  insert into public.admin_log(actor_id,action,target_id,details) values(auth.uid(),'ACCOUNT_APPROVAL_DECISION',p_user_id,jsonb_build_object('decision',p_decision,'fields',a.required_fields,'note',a.review_note));
  insert into public.notifications(user_id,title,body,type) values(p_user_id,
    case when p_decision='APPROVED' then 'Account freigegeben' else 'Bitte Account-Angaben korrigieren' end,
    case when p_decision='APPROVED' then 'Der zuständige Admin hat deinen Account geprüft und freigegeben.' else a.review_note||' Du kannst die Korrekturen direkt nach der Anmeldung einreichen.' end,'ACCOUNT_APPROVAL');
  return to_jsonb(a);
end;
$fn$;

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
