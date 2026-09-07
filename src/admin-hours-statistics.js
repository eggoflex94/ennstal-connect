import { supabase } from './supabaseClient';

let loading=false;
const LAYOUTS=[['Standard',0],['Alpen',2],['Aurora',5],['Ozean',10],['Schiefer',15],['Ember',20],['Bergrot',25],['Lavendel',30],['Mitternacht',35],['Sonnenaufgang',40],['Neon Connect',50]];
const hours=s=>Number(s||0)/3600;
const fmtHours=s=>`${hours(s).toLocaleString('de-AT',{minimumFractionDigits:1,maximumFractionDigits:1})} h`;
const unlockedCount=s=>{const h=hours(s);return LAYOUTS.filter(([,need])=>h>=need).length};
const nextLayout=s=>{const h=hours(s);const next=LAYOUTS.find(([,need])=>h<need);return next?`${next[0]} ab ${next[1]} h`:'Alle Designs frei'};
const inactivityLabel=date=>{if(!date)return'Noch keine Aktivität';const days=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000));if(days===0)return'Heute aktiv';if(days===1)return'Seit 1 Tag inaktiv';return`Seit ${days} Tagen inaktiv`};
const inactivityClass=date=>{if(!date)return'is-critical';const days=(Date.now()-new Date(date).getTime())/86400000;if(days>=30)return'is-critical';if(days>=14)return'is-warning';if(days>=7)return'is-watch';return'is-ok'};
const roleStar=role=>['HEAD_ADMIN','ADMIN'].includes(String(role||'').toUpperCase())?'/role-star-red.svg':String(role||'').toUpperCase()==='SUPPORTER'?'/supporter-star.svg':'';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data:rows,error}=await supabase.rpc('ec_admin_online_statistics');
    if(error)throw error;
    if(!rows?.length){document.querySelector('.ec-hours-statistics')?.remove();return}
    render(rows);
  }catch(error){console.warn('Stundenstatistik konnte nicht geladen werden:',error)}
  finally{loading=false}
}

function render(rows){
  const root=document.querySelector('.admin-page');
  if(!root)return;
  let section=root.querySelector('.ec-hours-statistics');
  if(!section){
    section=document.createElement('section');section.className='ec-hours-statistics panel';
    const anchor=root.querySelector('.admin-member-cards,.ec-admin-role-overview');
    if(anchor)anchor.before(section);else root.appendChild(section);
  }
  const sorted=[...rows].sort((a,b)=>new Date(a.last_active_at||a.last_seen_at||0)-new Date(b.last_active_at||b.last_seen_at||0));
  const total=rows.reduce((sum,r)=>sum+Number(r.total_online_seconds||0),0);
  const inactive14=rows.filter(r=>!(r.last_active_at||r.last_seen_at)||Date.now()-new Date(r.last_active_at||r.last_seen_at).getTime()>=14*86400000).length;
  const active7=rows.filter(r=>{const d=r.last_active_at||r.last_seen_at;return d&&Date.now()-new Date(d).getTime()<7*86400000}).length;
  section.innerHTML=`<div class="ec-hours-head"><div><span class="eyebrow">ADMIN · STUNDENSTATISTIK</span><h2>Onlinezeit & Aktivität</h2><p>Globale Admins sehen alle Mitglieder. Regionaladmins sehen die Mitglieder ihrer zugewiesenen Region. Kein Punktesystem.</p></div><button type="button" class="ec-hours-refresh">Aktualisieren</button></div>
  <div class="ec-hours-summary"><article><small>Mitglieder</small><strong>${rows.length}</strong></article><article><small>Onlinezeit gesamt</small><strong>${fmtHours(total)}</strong></article><article><small>7 Tage aktiv</small><strong>${active7}</strong></article><article><small>14+ Tage inaktiv</small><strong>${inactive14}</strong></article></div>
  <div class="ec-hours-table-wrap"><table class="ec-hours-table"><thead><tr><th>Mitglied</th><th>Region</th><th>Onlinezeit</th><th>Designs frei</th><th>Nächste Belohnung</th><th>Letzte Aktivität</th></tr></thead><tbody>${sorted.map(r=>{const last=r.last_active_at||r.last_seen_at;const totalSeconds=Number(r.total_online_seconds||0);const star=roleStar(r.role);return`<tr><td><strong class="ec-hours-person">${star?`<img src="${star}" alt="">`:''}${esc(r.nickname||'Mitglied')}</strong><small>${esc(r.role||'MEMBER')}</small></td><td>${esc(r.home_region_name||'–')}</td><td>${fmtHours(totalSeconds)}</td><td><strong>${unlockedCount(totalSeconds)} / ${LAYOUTS.length}</strong></td><td>${nextLayout(totalSeconds)}</td><td><span class="ec-inactivity ${inactivityClass(last)}">${inactivityLabel(last)}</span>${last?`<small>${new Date(last).toLocaleString('de-AT',{dateStyle:'short',timeStyle:'short'})}</small>`:''}</td></tr>`}).join('')}</tbody></table></div>`;
  section.querySelector('.ec-hours-refresh')?.addEventListener('click',()=>void load());
}

function boot(){
  void load();
  const observer=new MutationObserver(()=>{if(document.querySelector('.admin-page')&&!document.querySelector('.ec-hours-statistics')){clearTimeout(window.__ecHoursStatistics);window.__ecHoursStatistics=setTimeout(()=>void load(),120)}});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:online-reward',()=>void load());
  window.addEventListener('ec:region-change',()=>setTimeout(()=>void load(),100));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();