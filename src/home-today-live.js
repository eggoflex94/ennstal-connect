import { supabase } from './supabaseClient';

let activeRegion = null;
let refreshTimer = null;
let requestVersion = 0;
let lastRegionId = null;
let lastLoadedAt = 0;
const FRESH_FOR_MS = 30_000;

const startOfTodayIso = () => {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
};
const sinceDaysIso = (days) => new Date(Date.now() - days * 86400000).toISOString();

function currentRegionSlug(){
  return document.querySelector('.ec-region-picker select')?.value
    || document.documentElement.dataset.ecRegion
    || localStorage.getItem('ec-active-region')
    || '';
}

async function resolveRegion(){
  if(activeRegion?.id) return activeRegion;
  const slug = currentRegionSlug();
  if(!slug || !supabase) return null;
  const { data } = await supabase.from('regions').select('id,slug,name').eq('slug',slug).maybeSingle();
  return data || null;
}

function setCount(kind, count, detail){
  const card = document.querySelector(`#ec-home-activation [data-ec-today-kind="${kind}"]`);
  if(!card) return;
  const badge = card.querySelector('.ec-today-count');
  if(badge){
    badge.textContent = String(Number(count)||0);
    badge.dataset.empty = Number(count) > 0 ? '0' : '1';
  }
  if(detail){
    const copy = card.querySelector('small');
    if(copy) copy.textContent = detail;
  }
}

async function countQuery(query){
  try{
    const { count, error } = await query;
    return error ? 0 : Number(count||0);
  }catch{
    return 0;
  }
}

async function refreshToday(force=false){
  if(!supabase || !document.querySelector('.home-page')) return;
  const region = await resolveRegion();
  if(!region?.id) return;
  if(!force && lastRegionId===region.id && Date.now()-lastLoadedAt<FRESH_FOR_MS) return;
  const version = ++requestVersion;
  const now = new Date().toISOString();
  const today = startOfTodayIso();
  const week = sinceDaysIso(7);

  const [municipality,events,requests,members,forum,business] = await Promise.all([
    countQuery(
      supabase.from('municipality_notices')
        .select('id',{count:'exact',head:true})
        .eq('region_id',region.id)
        .eq('published',true)
        .gte('published_at',week)
    ),
    countQuery(
      supabase.from('community_events')
        .select('id',{count:'exact',head:true})
        .eq('region_id',region.id)
        .gte('event_at',today)
        .neq('status','CANCELLED')
    ),
    countQuery(
      supabase.from('community_requests')
        .select('id',{count:'exact',head:true})
        .eq('region_id',region.id)
        .eq('status','ACTIVE')
    ),
    countQuery(
      supabase.from('profiles')
        .select('id',{count:'exact',head:true})
        .eq('home_region_id',region.id)
        .eq('account_status','ACTIVE')
        .eq('is_test_account',false)
        .gte('created_at',week)
    ),
    countQuery(
      supabase.from('forum_posts')
        .select('id',{count:'exact',head:true})
        .eq('region_id',region.id)
        .eq('scope','COMMUNITY')
        .gte('created_at',week)
    ),
    countQuery(
      supabase.from('business_listings')
        .select('id',{count:'exact',head:true})
        .eq('region_id',region.id)
        .eq('is_active',true)
        .or(`valid_until.is.null,valid_until.gte.${now}`)
    )
  ]);

  if(version!==requestVersion) return;
  lastRegionId=region.id;
  lastLoadedAt=Date.now();

  setCount('municipality',municipality,municipality===1?'1 neuer offizieller Hinweis in den letzten 7 Tagen.':municipality?`${municipality} neue offizielle Hinweise in den letzten 7 Tagen.`:'Keine neuen Gemeinde-Hinweise in den letzten 7 Tagen.');
  setCount('events',events,events===1?'1 bevorstehende Veranstaltung.':events?`${events} bevorstehende Veranstaltungen.`:'Derzeit keine bevorstehenden Veranstaltungen.');
  setCount('requests',requests,requests===1?'1 offenes Gesuch wartet auf Unterstützung.':requests?`${requests} offene Gesuche warten auf Unterstützung.`:'Aktuell keine offenen Gesuche.');
  setCount('members',members,members===1?'1 neues Mitglied in den letzten 7 Tagen.':members?`${members} neue Mitglieder in den letzten 7 Tagen.`:'Keine neuen Mitglieder in den letzten 7 Tagen.');
  setCount('forum',forum,forum===1?'1 neue Diskussion in den letzten 7 Tagen.':forum?`${forum} neue Diskussionen in den letzten 7 Tagen.`:'Keine neuen Diskussionen in den letzten 7 Tagen.');
  setCount('business',business,business===1?'1 aktives lokales Angebot.':business?`${business} aktive lokale Angebote.`:'Aktuell keine lokalen Angebote.');
}

function schedule(delay=180,force=false){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>void refreshToday(force),delay);
}

window.addEventListener('ec:region-change',(event)=>{
  activeRegion=event.detail||null;
  requestVersion+=1;
  lastLoadedAt=0;
  schedule(120,true);
});
window.addEventListener('ec:navigate',()=>schedule(180,false));
window.addEventListener('focus',()=>schedule(80,false));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(80,false)});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>schedule(260,true),{once:true});
else schedule(260,true);
