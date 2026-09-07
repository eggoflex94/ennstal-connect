import { supabase } from './supabaseClient';

let viewerId='';
let canManagePopups=false;
let canViewStatistics=false;
let queued=false;
let people=new Map();

const INFO_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>';
const POPUP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>';
const STATS_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function personStar(p){
  const role=String(p?.role||'MEMBER').toUpperCase();
  if(role==='HEAD_ADMIN'||role==='ADMIN')return'/role-star-red.svg';
  if(role==='SUPPORTER')return'/supporter-star.svg';
  if(p?.account_badge==='BUSINESS')return'/role-star-blue.svg';
  return'';
}

function closeOverlay(){document.querySelector('.ec-dashboard-info-overlay')?.remove();document.body.classList.remove('ec-dashboard-info-open')}
function go(page){document.body.classList.remove('ec-dock-open');window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}))}
function placeDockInPageFlow(){const dock=document.querySelector('.ec-right-dock'),main=document.querySelector('.modern-main');if(!dock||!main)return;dock.classList.add('ec-document-flow-dock');if(dock.parentElement!==main)main.appendChild(dock)}
function openPopupManager(){closeOverlay();document.body.classList.remove('ec-dock-open');window.dispatchEvent(new CustomEvent('ec:open-community-popup-manager'))}
function openStatistics(){closeOverlay();document.body.classList.remove('ec-dock-open');window.dispatchEvent(new CustomEvent('ec:open-admin-statistics'))}

function openInfo(){
  closeOverlay();const overlay=document.createElement('div');overlay.className='ec-dashboard-info-overlay';
  overlay.innerHTML=`<section class="ec-dashboard-info-card" role="dialog" aria-modal="true" aria-labelledby="ec-info-title"><header><div><span>ENNSTAL CONNECT</span><h2 id="ec-info-title">Info & Orientierung</h2></div><button type="button" class="ec-dashboard-info-close" aria-label="Schließen">×</button></header><div class="ec-dashboard-info-grid"><article><b>Region</b><p>Die gewählte Region steuert regionale Mitglieder, Neuigkeiten, Events und Zuständigkeiten.</p></article><article><b>Mein Bereich</b><p>Profil, Nachrichten, Freunde, Benachrichtigungen und Community-Aktivitäten bleiben direkt erreichbar.</p></article><article><b>Profilbesuche</b><p>Es werden die letzten unterschiedlichen Besucher angezeigt. Ein Klick öffnet direkt das jeweilige Profil.</p></article><article><b>Hilfe</b><p>Für Erklärungen und Support steht zusätzlich der Hilfe-Bereich zur Verfügung.</p></article></div><footer><button type="button" data-info-action="help">Hilfe öffnen</button>${canViewStatistics?'<button type="button" data-info-action="stats">Statistik</button>':''}${canManagePopups?'<button type="button" class="primary" data-info-action="popups">News-Popups</button>':''}</footer></section>`;
  document.body.appendChild(overlay);document.body.classList.add('ec-dashboard-info-open');overlay.querySelector('.ec-dashboard-info-close').onclick=closeOverlay;overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay()});overlay.querySelector('[data-info-action="help"]').onclick=()=>{closeOverlay();go('help')};overlay.querySelector('[data-info-action="stats"]')?.addEventListener('click',openStatistics);overlay.querySelector('[data-info-action="popups"]')?.addEventListener('click',openPopupManager);overlay.querySelector('.ec-dashboard-info-close').focus()
}

function makeUtilityButton(kind){
  const button=document.createElement('button');button.type='button';button.className=`ec-compact-menu-item ec-dashboard-utility-button ec-dashboard-${kind}-button`;
  const labels={info:'Info',popups:'News-Popups',stats:'Statistik'};const label=labels[kind]||kind;button.title=label;button.setAttribute('aria-label',label);
  const icon=kind==='info'?INFO_ICON:kind==='stats'?STATS_ICON:POPUP_ICON;
  button.innerHTML=`<span class="ec-compact-menu-icon">${icon}</span><span class="ec-compact-menu-label">${label}</span>`;
  button.onclick=kind==='info'?openInfo:kind==='stats'?openStatistics:openPopupManager;return button
}
function ensureUtilityButtons(){
  const dock=document.querySelector('.ec-right-dock'),grid=dock?.querySelector('.ec-compact-menu-grid');if(!dock||!grid)return;
  if(!grid.querySelector('.ec-dashboard-info-button'))grid.appendChild(makeUtilityButton('info'));
  const stats=grid.querySelector('.ec-dashboard-stats-button');if(canViewStatistics&&!stats)grid.appendChild(makeUtilityButton('stats'));if(!canViewStatistics&&stats)stats.remove();
  const popups=grid.querySelector('.ec-dashboard-popups-button');if(canManagePopups&&!popups)grid.appendChild(makeUtilityButton('popups'));if(!canManagePopups&&popups)popups.remove()
}

function rebuildVisitRow(row,id){const p=people.get(id);if(!p)return;const star=personStar(p);const time=row.querySelector('time')?.textContent||'';row.innerHTML=`<span class="ec-profile-visit-identity">${star?`<img class="ec-inline-role-star" src="${star}" alt="" aria-hidden="true">`:''}<strong>${esc(p.nickname||'Mitglied')}</strong><small>hat dein Profil besucht</small></span><time>${esc(time)}</time>`;row.dataset.profileId=id;row.classList.add('ec-profile-visit-row-clean')}
function normalizeProfileVisits(){const panel=document.querySelector('.ec-dock-detail[data-panel="visits"]');if(!panel)return;const seen=new Set();[...panel.querySelectorAll('.ec-dock-detail-row')].forEach(row=>{const id=String(row.dataset.profileId||'');if(!id||id===viewerId||seen.has(id)){row.remove();return}seen.add(id);rebuildVisitRow(row,id)});const count=document.querySelector('.ec-dock-visits-count');if(count)count.textContent=String(panel.querySelectorAll('.ec-dock-detail-row').length)}
function normalizeActivityStars(){document.querySelectorAll('.ec-dock-detail-row img.ec-inline-role-star').forEach(star=>{if((star.getAttribute('src')||'').includes('role-star-member'))star.remove()})}
function apply(){placeDockInPageFlow();ensureUtilityButtons();normalizeProfileVisits();normalizeActivityStars()}

async function loadRights(){
  if(!supabase)return;
  try{
    const {data:{user}}=await supabase.auth.getUser();if(!user)return;viewerId=user.id;canViewStatistics=true;
    const [{data:profile},{data:assignments},{data:moderation},{data:profiles}]=await Promise.all([
      supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true),
      supabase.from('profiles').select('id,nickname,role,account_badge').eq('account_status','ACTIVE')
    ]);
    people=new Map((profiles||[]).map(p=>[p.id,p]));
    const role=String(profile?.role||'').toUpperCase(),globalAdmin=['HEAD_ADMIN','ADMIN'].includes(role),assigned=new Set((assignments||[]).filter(x=>x.active).map(x=>x.region_id));
    canManagePopups=globalAdmin||(moderation||[]).some(m=>m.active&&assigned.has(m.region_id)&&Array.isArray(m.permissions)&&m.permissions.includes('ANNOUNCEMENTS'));
    apply();
  }catch(error){console.warn('Dashboard-Zusatzfunktionen konnten nicht vollständig geladen werden:',error);canViewStatistics=Boolean(viewerId);apply()}
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})}
function boot(){apply();void loadRights();const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('ec:region-change',()=>setTimeout(()=>{apply();void loadRights()},100));window.addEventListener('ec:community-announcements-refresh',()=>setTimeout(apply,80));window.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlay()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();