import { supabase } from './supabaseClient';

let mounted=false;
let loading=false;
const LAYOUTS=[['Standard',0],['Alpen',2],['Aurora',5],['Ozean',10],['Schiefer',15],['Ember',20],['Bergrot',25],['Lavendel',30],['Mitternacht',35],['Sonnenaufgang',40],['Neon Connect',50]];
const hours=s=>Number(s||0)/3600;
const fmtHours=s=>`${hours(s).toLocaleString('de-AT',{minimumFractionDigits:1,maximumFractionDigits:1})} h`;
const unlockedCount=s=>{const h=hours(s);return LAYOUTS.filter(([,need])=>h>=need).length};
const nextLayout=s=>{const h=hours(s);const next=LAYOUTS.find(([,need])=>h<need);return next?`${next[0]} ab ${next[1]} h`:'Alle Designs frei'};
const inactivityLabel=date=>{if(!date)return'Noch keine Aktivität';const days=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000));if(days===0)return'Heute aktiv';if(days===1)return'Seit 1 Tag inaktiv';return`Seit ${days} Tagen inaktiv`};
const inactivityClass=date=>{if(!date)return'is-critical';const days=(Date.now()-new Date(date).getTime())/86400000;if(days>=30)return'is-critical';if(days>=14)return'is-warning';if(days>=7)return'is-watch';return'is-ok'};

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data:viewer}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
    if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN')return;
    const {data,error}=await supabase.from('profiles').select('id,nickname,role,account_status,total_online_seconds,online_seconds,last_active_at,last_seen_at').order('nickname');
    if(error)throw error;
    render(data||[]);
  }catch(error){console.warn('Stundenstatistik konnte nicht geladen werden:',error)}
  finally{loading=false}
}

function render(rows){
  const root=document.querySelector('.admin-page');
  if(!root)return;
  let section=root.querySelector('.ec-hours-statistics');
  if(!section){section=document.createElement('section');section.className='ec-hours-statistics panel';root.querySelector('.admin-member-cards')?.before(section)}
  const sorted=[...rows].sort((a,b)=>new Date(a.last_active_at||a.last_seen_at||0)-new Date(b.last_active_at||b.last_seen_at||0));
  const total=rows.reduce((sum,r)=>sum+Number(r.total_online_seconds||r.online_seconds||0),0);
  const inactive14=rows.filter(r=>!r.last_active_at||Date.now()-new Date(r.last_active_at).getTime()>=14*86400000).length;
  const active7=rows.filter(r=>r.last_active_at&&Date.now()-new Date(r.last_active_at).getTime()<7*86400000).length;
  section.innerHTML=`<div class="ec-hours-head"><div><span class="eyebrow">HEAD ADMIN · STUNDENSTATISTIK</span><h2>Aktivität & Profil-Belohnungen</h2><p>Onlinezeit, Inaktivität und automatisch freigeschaltete Profilgestaltungen. Es gibt kein Punktesystem.</p></div><button type="button" class="ec-hours-refresh">Aktualisieren</button></div>
  <div class="ec-hours-summary"><article><small>Mitglieder</small><strong>${rows.length}</strong></article><article><small>Onlinezeit gesamt</small><strong>${fmtHours(total)}</strong></article><article><small>7 Tage aktiv</small><strong>${active7}</strong></article><article><small>14+ Tage inaktiv</small><strong>${inactive14}</strong></article></div>
  <div class="ec-hours-table-wrap"><table class="ec-hours-table"><thead><tr><th>Mitglied</th><th>Onlinezeit</th><th>Designs frei</th><th>Nächste Belohnung</th><th>Letzte Aktivität</th></tr></thead><tbody>${sorted.map(r=>{const last=r.last_active_at||r.last_seen_at;const totalSeconds=Number(r.total_online_seconds||r.online_seconds||0);return`<tr><td><strong>${String(r.nickname||'Mitglied').replace(/[&<>"']/g,'')}</strong><small>${String(r.role||'MEMBER')}</small></td><td>${fmtHours(totalSeconds)}</td><td><strong>${unlockedCount(totalSeconds)} / ${LAYOUTS.length}</strong></td><td>${nextLayout(totalSeconds)}</td><td><span class="ec-inactivity ${inactivityClass(last)}">${inactivityLabel(last)}</span>${last?`<small>${new Date(last).toLocaleString('de-AT',{dateStyle:'short',timeStyle:'short'})}</small>`:''}</td></tr>`}).join('')}</tbody></table></div>`;
  section.querySelector('.ec-hours-refresh')?.addEventListener('click',()=>void load());
  mounted=true;
}

function boot(){void load();const observer=new MutationObserver(()=>{if(document.querySelector('.admin-page')&&!mounted){clearTimeout(window.__ecHoursStatistics);window.__ecHoursStatistics=setTimeout(()=>void load(),120)}});observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('ec:online-reward',()=>void load())}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
