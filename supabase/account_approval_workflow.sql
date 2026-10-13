-- Account approval is separate from Auth, suspension and document verification.
-- Existing accounts remain usable. Only new profiles enter the pending queue.
create table if not exists public.account_approvals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','CHANGES_REQUIRED','APPROVED','LEGACY_ACTIVE')),
  required_fields text[] not null default '{}' check (required_fields <@ array['first_name','last_name','birth_date']::text[]),
  review_note text not null default '' check (length(review_note)<=1000),
  member_note text not null default '' check (length(member_note)<=1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists account_approvals_status_created_idx on public.account_approvals(status,created_at);
alter table public.account_approvals enable row level security;
revoke all on public.account_approvals from public, anon, authenticated;
grant select on public.account_approvals to authenticated;
drop policy if exists account_approvals_read on public.account_approvals;
create policy account_approvals_read on public.account_approvals for select to authenticated
  using (user_id=(select auth.uid()) or (select public.ec_is_head_admin()));

insert into public.account_approvals(user_id,status)
select id,'LEGACY_ACTIVE' from public.profiles on conflict(user_id) do nothing;

create or replace function private.ec_queue_account_approval()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  insert into public.account_approvals(user_id,status) values(new.id,case when new.role::text='HEAD_ADMIN' then 'LEGACY_ACTIVE' else 'PENDING' end) on conflict(user_id) do nothing;
  return new;
end;
$fn$;
revoke all on function private.ec_queue_account_approval() from public,anon,authenticated;
drop trigger if exists ec_queue_account_approval on public.profiles;
create trigger ec_queue_account_approval after insert on public.profiles for each row execute function private.ec_queue_account_approval();

create or replace function public.ec_my_account_approval()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select jsonb_build_object('status',a.status,'required_fields',a.required_fields,'review_note',a.review_note,
    'member_note',a.member_note,'updated_at',a.updated_at,'first_name',p.first_name,'last_name',p.last_name,'birth_date',p.birth_date)
  into result from public.account_approvals a join public.profiles p on p.id=a.user_id where a.user_id=auth.uid();
  return result;
end;
$fn$;

create or replace function public.ec_account_approval_queue(p_status text default 'OPEN',p_query text default '',p_limit int default 50,p_offset int default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare result jsonb;
begin
  if auth.uid() is null or not public.ec_is_head_admin() then raise exception 'Nur der Hauptadmin darf Accounts prüfen.'; end if;
  if p_status not in ('OPEN','PENDING','CHANGES_REQUIRED','APPROVED','LEGACY_ACTIVE','ALL') then raise exception 'Ungültiger Filter.'; end if;
  with selected as (
    select a.*,p.nickname,p.first_name,p.last_name,p.birth_date,p.home_region_id,p.created_at as registered_at
    from public.account_approvals a join public.profiles p on p.id=a.user_id
    where p.account_status='ACTIVE' and p.role::text<>'HEAD_ADMIN'
    and (p_status='ALL' or (p_status='OPEN' and a.status in ('PENDING','CHANGES_REQUIRED')) or a.status=p_status)
    and (coalesce(trim(p_query),'')='' or concat_ws(' ',p.nickname,p.first_name,p.last_name) ilike '%'||left(trim(p_query),100)||'%')
  ) select jsonb_build_object('total',(select count(*) from selected),'items',coalesce((select jsonb_agg(to_jsonb(r)) from (
    select * from selected order by created_at,user_id limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset)
  ) r),'[]'::jsonb)) into result;
  return result;
end;
$fn$;

create or replace function private.ec_account_names_valid(p_first text,p_last text,p_birth date)
returns boolean language sql immutable set search_path=pg_catalog as $fn$
  select coalesce(length(trim(p_first)) between 2 and 80 and length(trim(p_last)) between 2 and 80
    and normalize(trim(p_first),NFC) ~ $name$^[[:alpha:]][[:alpha:]'’ -]*$$name$
    and normalize(trim(p_last),NFC) ~ $name$^[[:alpha:]][[:alpha:]'’ -]*$$name$ and p_birth is not null,false)
$fn$;
revoke all on function private.ec_account_names_valid(text,text,date) from public,anon,authenticated;

create or replace function public.ec_review_account_approval(p_user_id uuid,p_decision text,p_fields text[] default '{}',p_note text default '',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare a public.account_approvals%rowtype; p public.profiles%rowtype;
begin
  if auth.uid() is null or not public.ec_is_head_admin() then raise exception 'Nur der Hauptadmin darf Accounts freigeben.'; end if;
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
    case when p_decision='APPROVED' then 'Der Hauptadmin hat deinen Account geprüft und freigegeben.' else a.review_note||' Du kannst die Korrekturen direkt nach der Anmeldung einreichen.' end,'ACCOUNT_APPROVAL');
  return to_jsonb(a);
end;
$fn$;

-- Private, transaction-scoped authorization for precisely the submitted identity.
create table if not exists private.ec_identity_correction_context (
  user_id uuid primary key,
  transaction_id bigint not null,
  first_name text,
  last_name text,
  birth_date date
);
revoke all on private.ec_identity_correction_context from public,anon,authenticated;
alter table private.ec_identity_correction_context enable row level security;

create or replace function public.lock_profile_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $lock$
begin
  if auth.uid()=old.id and (
    new.first_name is distinct from old.first_name or
    new.last_name is distinct from old.last_name or
    new.birth_date is distinct from old.birth_date
  ) and not exists (
    select 1 from private.ec_identity_correction_context c
    where c.user_id=auth.uid() and c.transaction_id=txid_current()
      and c.first_name is not distinct from new.first_name
      and c.last_name is not distinct from new.last_name
      and c.birth_date is not distinct from new.birth_date
  ) then
    raise exception 'Vorname, Nachname und Geburtsdatum können nur im Rahmen angeforderter Account-Korrekturen geändert werden.';
  end if;
  return new;
end;
$lock$;
revoke all on function public.lock_profile_identity() from public,anon,authenticated;

create or replace function public.ec_submit_account_corrections(p_changes jsonb,p_note text default '',p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $fn$
declare a public.account_approvals%rowtype; p public.profiles%rowtype; field text;
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select * into a from public.account_approvals where user_id=auth.uid() for update;
  if not found or a.status<>'CHANGES_REQUIRED' then raise exception 'Es sind keine Korrekturen offen.'; end if;
  if p_expected_updated_at is not null and a.updated_at is distinct from p_expected_updated_at then raise exception 'Die Auflagen wurden geändert. Bitte neu laden.'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or length(coalesce(p_note,''))>1000 then raise exception 'Ungültige Korrekturen.'; end if;
  for field in select jsonb_object_keys(p_changes) loop
    if not field=any(a.required_fields) then raise exception 'Nur die angeforderten Angaben dürfen hier geändert werden.'; end if;
  end loop;
  foreach field in array a.required_fields loop
    if not p_changes ? field or nullif(trim(p_changes->>field),'') is null then raise exception 'Bitte alle angeforderten Angaben ausfüllen.'; end if;
  end loop;
  select * into p from public.profiles where id=auth.uid() and account_status='ACTIVE' for update;
  if not found then raise exception 'Kein aktiver Account gefunden.'; end if;
  p.first_name:=case when p_changes ? 'first_name' then trim(p_changes->>'first_name') else p.first_name end;
  p.last_name:=case when p_changes ? 'last_name' then trim(p_changes->>'last_name') else p.last_name end;
  if p_changes ? 'birth_date' then
    begin p.birth_date:=(p_changes->>'birth_date')::date; exception when others then raise exception 'Bitte ein gültiges Geburtsdatum angeben.'; end;
    if p.birth_date>current_date or p.birth_date<current_date-interval '130 years' then raise exception 'Bitte ein gültiges Geburtsdatum angeben.'; end if;
  end if;
  if (p_changes ? 'first_name' or p_changes ? 'last_name') and not private.ec_account_names_valid(p.first_name,p.last_name,coalesce(p.birth_date,current_date)) then raise exception 'Bitte vollständige Vor- und Nachnamen ohne Zahlen angeben.'; end if;
  insert into private.ec_identity_correction_context(user_id,transaction_id,first_name,last_name,birth_date)
    values(auth.uid(),txid_current(),p.first_name,p.last_name,p.birth_date);
  update public.profiles set first_name=p.first_name,last_name=p.last_name,birth_date=p.birth_date where id=auth.uid();
  delete from private.ec_identity_correction_context where user_id=auth.uid();
  update public.account_approvals set status='PENDING',member_note=trim(coalesce(p_note,'')),updated_at=clock_timestamp() where user_id=auth.uid() returning * into a;
  insert into public.admin_log(actor_id,action,target_id,details) values(auth.uid(),'ACCOUNT_CORRECTIONS_SUBMITTED',auth.uid(),jsonb_build_object('fields',a.required_fields));
  return to_jsonb(a);
end;
$fn$;

revoke all on function public.ec_my_account_approval() from public,anon;
revoke all on function public.ec_account_approval_queue(text,text,int,int) from public,anon;
revoke all on function public.ec_review_account_approval(uuid,text,text[],text,timestamptz) from public,anon;
revoke all on function public.ec_submit_account_corrections(jsonb,text,timestamptz) from public,anon;
grant execute on function public.ec_my_account_approval() to authenticated;
grant execute on function public.ec_account_approval_queue(text,text,int,int) to authenticated;
grant execute on function public.ec_review_account_approval(uuid,text,text[],text,timestamptz) to authenticated;
grant execute on function public.ec_submit_account_corrections(jsonb,text,timestamptz) to authenticated;

-- Changing approved identity details requires another review, never a login block.
create or replace function private.ec_recheck_changed_account_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $fn$
begin
  if new.role::text<>'HEAD_ADMIN' and (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name or new.birth_date is distinct from old.birth_date) then
    update public.account_approvals set status='PENDING',approved_at=null,updated_at=clock_timestamp()
      where user_id=new.id and status='APPROVED';
  end if;
  return new;
end;
$fn$;
revoke all on function private.ec_recheck_changed_account_identity() from public,anon,authenticated;
drop trigger if exists ec_recheck_changed_account_identity on public.profiles;
create trigger ec_recheck_changed_account_identity after update of first_name,last_name,birth_date on public.profiles for each row execute function private.ec_recheck_changed_account_identity();
