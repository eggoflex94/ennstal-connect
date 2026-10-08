-- Automatic regional weekly polls.
-- Idempotent: every active region receives at most one automatically published
-- poll per local calendar week. The cron runs several times a day so a missed
-- Monday run is automatically caught up.

create extension if not exists pg_cron with schema extensions;

create table if not exists public.community_weekly_poll_question_bank (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references public.regions(id) on delete cascade,
  question text not null unique,
  options text[] not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint weekly_poll_bank_options check (
    cardinality(options) between 2 and 6
  )
);

alter table public.community_weekly_poll_question_bank enable row level security;
revoke all on table public.community_weekly_poll_question_bank from anon, authenticated;

insert into public.community_weekly_poll_question_bank(question,options)
values
('Was macht {REGION} für euch besonders?', array['Die Menschen und das Miteinander','Natur und Landschaft','Veranstaltungen und Brauchtum','Lokale Betriebe und Gastronomie']),
('Was würdet ihr Gästen in {REGION} als Erstes zeigen?', array['Einen Lieblingsplatz in der Natur','Ein regionales Lokal','Eine Sehenswürdigkeit','Ein Fest oder eine Veranstaltung']),
('Wovon sollte es in {REGION} künftig mehr geben?', array['Treffen und gemeinsame Aktivitäten','Veranstaltungen für alle Generationen','Regionale Märkte und Angebote','Freizeit- und Sportangebote']),
('Wie verbringt ihr einen freien Tag in {REGION} am liebsten?', array['Draußen in der Natur','Bei einer Veranstaltung','Gemütlich mit Freunden oder Familie','Unterwegs bei regionalen Betrieben']),
('Was verbindet Menschen in {REGION} am meisten?', array['Gemeinsame Veranstaltungen','Vereine und Ehrenamt','Nachbarschaft und Freundschaften','Tradition und Regionalität']),
('Welche Art von Community-Treffen würdet ihr besuchen?', array['Gemütlicher Stammtisch','Gemeinsame Wanderung oder Spaziergang','Spiele- oder Quizabend','Gemeinsamer Veranstaltungsbesuch']),
('Welche regionalen Inhalte interessieren euch am meisten?', array['Veranstaltungen und Termine','Ausflugstipps und Lieblingsplätze','Neuigkeiten aus Gemeinden','Menschen, Vereine und Betriebe aus der Region']),
('Was fehlt euch manchmal bei regionalen Online-Angeboten?', array['Mehr echte lokale Informationen','Einfacher Austausch mit anderen','Übersicht über Veranstaltungen','Mehr Sichtbarkeit für kleine Initiativen']),
('Was sollte in einer guten regionalen Community an erster Stelle stehen?', array['Respektvoller Umgang','Hilfsbereitschaft','Ehrliche regionale Informationen','Gemeinsame Aktivitäten']),
('Wie entdeckt ihr neue Veranstaltungen in eurer Region?', array['Über Freunde und Bekannte','Über soziale Medien','Über Gemeinden oder Vereine','Durch regionale Plattformen']),
('Was motiviert euch am ehesten, in einer Community aktiv mitzumachen?', array['Interessante Gespräche','Neue Menschen kennenlernen','Regionale Informationen teilen','Bei Aktionen und Events mitmachen']),
('Welche Jahreszeit zeigt {REGION} von seiner schönsten Seite?', array['Frühling','Sommer','Herbst','Winter'])
on conflict (question) do nothing;

create or replace function public.ec_publish_automatic_weekly_polls()
returns table(region_id uuid, region_name text, poll_id uuid, published boolean)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_region record;
  v_bank record;
  v_creator uuid;
  v_poll_id uuid;
  v_week_start date := date_trunc('week', timezone('Europe/Vienna', now()))::date;
begin
  select p.id into v_creator
  from public.profiles p
  where coalesce(p.is_primary_head_admin,false)=true
    and p.account_status='ACTIVE'
  order by p.created_at asc
  limit 1;

  if v_creator is null then
    raise exception 'Kein aktiver primärer Head Admin für automatische Wochenfragen gefunden.';
  end if;

  for v_region in
    select r.id,r.name
    from public.regions r
    where r.is_active=true
    order by r.name
  loop
    select p.id into v_poll_id
    from public.community_weekly_polls p
    where p.region_id=v_region.id
      and date_trunc('week', timezone('Europe/Vienna', p.created_at))::date=v_week_start
    order by p.created_at desc
    limit 1;

    if v_poll_id is not null then
      region_id:=v_region.id;
      region_name:=v_region.name;
      poll_id:=v_poll_id;
      published:=false;
      return next;
      continue;
    end if;

    select q.* into v_bank
    from public.community_weekly_poll_question_bank q
    where q.is_active=true
      and (q.region_id is null or q.region_id=v_region.id)
    order by
      case when q.region_id=v_region.id then 0 else 1 end,
      q.last_used_at nulls first,
      md5(q.id::text || v_region.id::text || v_week_start::text)
    limit 1;

    if v_bank.id is null then
      raise warning 'Keine Wochenfrage für Region % gefunden.', v_region.name;
      continue;
    end if;

    update public.community_weekly_polls p
    set is_active=false
    where p.region_id=v_region.id
      and p.is_active=true;

    insert into public.community_weekly_polls(
      question,options,is_active,created_by,region_id
    )
    values(
      replace(v_bank.question,'{REGION}',v_region.name),
      v_bank.options,
      true,
      v_creator,
      v_region.id
    )
    returning id into v_poll_id;

    update public.community_weekly_poll_question_bank q
    set last_used_at=now()
    where q.id=v_bank.id;

    region_id:=v_region.id;
    region_name:=v_region.name;
    poll_id:=v_poll_id;
    published:=true;
    return next;
  end loop;
end;
$$;

revoke all on function public.ec_publish_automatic_weekly_polls() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='ec-automatic-weekly-polls';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'ec-automatic-weekly-polls',
    '15 */6 * * *',
    $cron$select public.ec_publish_automatic_weekly_polls();$cron$
  );
end;
$$;

-- Publish missing polls immediately on installation.
select * from public.ec_publish_automatic_weekly_polls();
