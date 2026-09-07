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

async function getViewer(){
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return null;
  const {data,error}=await supabase.from('profiles').select('id,nickname,role,account_badge,total_online_seconds,last_active_at,home_region_id').eq('id',user.id).maybeSingle();
  if(error)throw error;return data||null;
}

async function getAdminRows(viewer){
  const role=String(viewer?.role||'').toUpperCase();
  if(!['HEAD_ADMIN','ADMIN'].includes(role))return[];
  const {data,error}=await supabase.rpc('ec_admin_online_statistics');
  if(error)throw error;return data||[];
}

function personalMarkup(viewer){
  const total=Number(viewer?.total_online_seconds||0);
  const last=viewer?.last_active_at||null;
  return `<section class="ec-hours-personal panel"><div class="ec-hours-personal-head"><div><span class="eyebrow">MEINE STATISTIK</span><h2>${esc(viewer?.nickname||'Mein Konto')}</h2><p>Diese persönliche Übersicht ist nur für dich sichtbar.</p></div></div><div class="ec-hours-summary"><article><small>Onlinezeit</small><strong>${fmtHours(total)}</strong></article><article><small>Designs frei</small><strong>${unlockedCount(total)} / ${LAYOUTS.length}</strong></article><article><small>Nächste Belohnung</small><strong>${esc(nextLayout(total))}</strong></article><article><small>Letzte Aktivität</small><strong>${esc(inactivityLabel(last))}</strong></article></div></section>`;
}

function adminMarkup(rows){
  const sorted=[...rows].sort((a,b)=>new Date(a.last_active_at||a.last_seen_at||0)-new Date(b.last_active_at||b.last_seen_at||0));
  const total=rows.reduce((sum,r)=>sum+Number(r.total_online_seconds||0),0);
  const inactive14=rows.filter(r=>!(r.last_active_at||r.last_seen_at)||Date.now()-new Date(r.last_active_at||r.last_seen_at).getTime()>=14*86400000).length;
  const active7=rows.filter(r=>{const d=r.last_active_at||r.last_seen_at;return d&&Date.now()-new Date(d).getTime()<7*86400000}).length;
  return `<section class="ec-hours-statistics panel"><div class="ec-hours-head"><div><span class="eyebrow">ADMIN · GESAMTSTATISTIK</span><h2>Onlinezeit & Aktivität</h2><p>Admins sehen hier die Statistik aller Mitglieder.</p></div><button type="button" class="ec-hours-refresh">Aktualisieren</button></div><div class="ec-hours-summary"><article><small>Mitglieder</small><strong>${rows.length}</strong></article><article><small>Onlinezeit gesamt</small><strong>${fmtHours(total)}</strong></article><article><small>7 Tage aktiv</small><strong>${active7}</strong></article><article><small>14+ Tage inaktiv</small><strong>${inactive14}</strong></article></div><div class="ec-hours-table-wrap"><table class="ec-hours-table"><thead><tr><th>Mitglied</th><th>Region</th><th>Onlinezeit</th><th>Designs frei</th><th>Nächste Belohnung</th><th>Letzte Aktivität</th></tr></thead><tbody>${sorted.map(r=>{const last=r.last_active_at||r.last_seen_at;const totalSeconds=Number(r.total_online_seconds||0);const star=roleStar(r.role);return`<tr><td><strong class="ec-hours-person">${star?`<img src="${star}" alt="">`:''}${esc(r.nickname||'Mitglied')}</strong></td><td>${esc(r.home_region_name||'–')}</td><td>${fmtHours(totalSeconds)}</td><td>${unlockedCount(totalSeconds)} / ${LAYOUTS.length}</td><td>${esc(nextLayout(totalSeconds))}</td><td><span class="ec-inactivity ${inactivityClass(last)}">${esc(inactivityLabel(last))}</span>${last?`<small>${esc(new Date(last).toLocaleString('de-AT',{dateStyle:'short',timeStyle:'short'}))}</small>`:''}</td></tr>`}).join('')}</tbody></table></div></section>`;
}

async function renderPage(){
  if(loading)return;loading=true;
  try{
    const root=document.querySelector('.content-root');if(!root)return;
    let page=root.querySelector('.ec-statistics-page');if(!page){page=document.createElement('section');page.className='ec-statistics-page';root.appendChild(page)}
    document.body.classList.add('ec-statistics-page-open');
    page.innerHTML='<div class="ec-tool-page-head"><button type="button" class="ec-tool-page-back">← Zurück</button><div><span class="eyebrow">MEIN BEREICH</span><h1>Statistik</h1><p>Deine persönliche Aktivität und – mit Adminrechten – die Gesamtübersicht.</p></div></div><p class="ec-admin-tool-loading">Statistik wird geladen …</p>';
    page.querySelector('.ec-tool-page-back').onclick=()=>{closePage();window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'home'}}))};
    const viewer=await getViewer();if(!viewer){page.innerHTML+='<p class="ec-admin-tool-error">Statistik konnte nicht geladen werden.</p>';return}
    const rows=await getAdminRows(viewer);
    page.querySelector('.ec-admin-tool-loading')?.remove();
    page.insertAdjacentHTML('beforeend',personalMarkup(viewer));
    if(rows.length)page.insertAdjacentHTML('beforeend',adminMarkup(rows));
    page.querySelector('.ec-hours-refresh')?.addEventListener('click',()=>void renderPage());
    window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
  }catch(error){const page=document.querySelector('.ec-statistics-page');if(page)page.innerHTML=`<div class="ec-tool-page-head"><button type="button" class="ec-tool-page-back">← Zurück</button><div><span class="eyebrow">MEIN BEREICH</span><h1>Statistik</h1></div></div><p class="ec-admin-tool-error">Statistik konnte nicht geladen werden: ${esc(error.message||error)}</p>`;page?.querySelector('.ec-tool-page-back')?.addEventListener('click',()=>{closePage();window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'home'}}))})}finally{loading=false}
}

function closePage(){document.querySelector('.ec-statistics-page')?.remove();document.body.classList.remove('ec-statistics-page-open');window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'))}
function boot(){window.addEventListener('ec:open-admin-statistics',()=>void renderPage());window.addEventListener('ec:online-reward',()=>{if(document.body.classList.contains('ec-statistics-page-open'))void renderPage()});window.addEventListener('ec:navigate',()=>{if(document.body.classList.contains('ec-statistics-page-open'))closePage()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();