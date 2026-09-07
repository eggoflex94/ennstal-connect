import { supabase } from './supabaseClient';

let viewerId='';
let canManagePopups=false;
let queued=false;

const INFO_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>';
const POPUP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>';

function closeOverlay(){
  document.querySelector('.ec-dashboard-info-overlay')?.remove();
  document.body.classList.remove('ec-dashboard-info-open');
}

function go(page){
  document.body.classList.remove('ec-dock-open');
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page}}));
}

function placeDockInPageFlow(){
  const dock=document.querySelector('.ec-right-dock');
  const main=document.querySelector('.modern-main');
  if(!dock||!main)return;
  dock.classList.add('ec-document-flow-dock');
  if(dock.parentElement!==main)main.appendChild(dock);
}

function openPopupManager(){
  closeOverlay();
  go('admin');
  let tries=0;
  const timer=setInterval(()=>{
    tries+=1;
    const panel=document.querySelector('.ec-popup-admin-manager');
    if(panel){
      clearInterval(timer);
      panel.classList.add('ec-popup-admin-manager-focus');
      panel.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(()=>panel.classList.remove('ec-popup-admin-manager-focus'),1800);
    }else if(tries>24){
      clearInterval(timer);
      window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'));
    }
  },120);
}

function openInfo(){
  closeOverlay();
  const overlay=document.createElement('div');
  overlay.className='ec-dashboard-info-overlay';
  overlay.innerHTML=`<section class="ec-dashboard-info-card" role="dialog" aria-modal="true" aria-labelledby="ec-info-title"><header><div><span>ENNSTAL CONNECT</span><h2 id="ec-info-title">Info & Orientierung</h2></div><button type="button" class="ec-dashboard-info-close" aria-label="Schließen">×</button></header><div class="ec-dashboard-info-grid"><article><b>Region</b><p>Die gewählte Region steuert regionale Mitglieder, Neuigkeiten, Events und Zuständigkeiten.</p></article><article><b>Mein Bereich</b><p>Profil, Nachrichten, Freunde, Benachrichtigungen und Community-Aktivitäten bleiben direkt erreichbar.</p></article><article><b>Profilbesuche</b><p>Es werden die letzten unterschiedlichen Besucher angezeigt. Ein Klick öffnet direkt das jeweilige Profil.</p></article><article><b>Hilfe</b><p>Für Erklärungen und Support steht zusätzlich der Hilfe-Bereich zur Verfügung.</p></article></div><footer><button type="button" data-info-action="help">Hilfe öffnen</button>${canManagePopups?'<button type="button" class="primary" data-info-action="popups">Popups verwalten</button>':''}</footer></section>`;
  document.body.appendChild(overlay);
  document.body.classList.add('ec-dashboard-info-open');
  overlay.querySelector('.ec-dashboard-info-close').onclick=closeOverlay;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeOverlay()});
  overlay.querySelector('[data-info-action="help"]').onclick=()=>{closeOverlay();go('help')};
  overlay.querySelector('[data-info-action="popups"]')?.addEventListener('click',openPopupManager);
  overlay.querySelector('.ec-dashboard-info-close').focus();
}

function makeUtilityButton(kind){
  const button=document.createElement('button');
  button.type='button';
  button.className=`ec-compact-menu-item ec-dashboard-utility-button ec-dashboard-${kind}-button`;
  const label=kind==='info'?'Info':'Popups verwalten';
  button.title=label;
  button.setAttribute('aria-label',label);
  button.innerHTML=`<span class="ec-compact-menu-icon">${kind==='info'?INFO_ICON:POPUP_ICON}</span><span class="ec-compact-menu-label">${label}</span>`;
  button.onclick=kind==='info'?openInfo:openPopupManager;
  return button;
}

function ensureUtilityButtons(){
  const dock=document.querySelector('.ec-right-dock');
  const grid=dock?.querySelector('.ec-compact-menu-grid');
  if(!dock||!grid)return;
  if(!grid.querySelector('.ec-dashboard-info-button'))grid.appendChild(makeUtilityButton('info'));
  const existing=grid.querySelector('.ec-dashboard-popups-button');
  if(canManagePopups&&!existing)grid.appendChild(makeUtilityButton('popups'));
  if(!canManagePopups&&existing)existing.remove();
}

function normalizeProfileVisits(){
  const panel=document.querySelector('.ec-dock-detail[data-panel="visits"]');
  if(!panel)return;
  const seen=new Set();
  const rows=[...panel.querySelectorAll('.ec-dock-detail-row')];
  rows.forEach(row=>{
    const id=String(row.dataset.profileId||'');
    if(!id||id===viewerId||seen.has(id)){row.remove();return}
    seen.add(id);
    [...row.children].filter(child=>child.tagName==='IMG').forEach(img=>img.remove());
    row.querySelectorAll('img.ec-inline-role-star').forEach(star=>{
      const src=star.getAttribute('src')||'';
      if(src.includes('role-star-member'))star.remove();
      else{star.removeAttribute('alt');star.setAttribute('aria-hidden','true')}
    });
    const small=row.querySelector('small');
    if(small)small.textContent='hat dein Profil besucht';
    row.classList.add('ec-profile-visit-row-clean');
  });
  const count=document.querySelector('.ec-dock-visits-count');
  if(count)count.textContent=String(panel.querySelectorAll('.ec-dock-detail-row').length);
}

function normalizeActivityStars(){
  document.querySelectorAll('.ec-dock-detail-row img.ec-inline-role-star').forEach(star=>{
    if((star.getAttribute('src')||'').includes('role-star-member'))star.remove();
  });
}

function apply(){
  placeDockInPageFlow();
  ensureUtilityButtons();
  normalizeProfileVisits();
  normalizeActivityStars();
}

async function loadRights(){
  if(!supabase)return;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    viewerId=user.id;
    const [{data:profile},{data:assignments},{data:moderation}]=await Promise.all([
      supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true)
    ]);
    const role=String(profile?.role||'').toUpperCase();
    const assigned=new Set((assignments||[]).filter(x=>x.active).map(x=>x.region_id));
    canManagePopups=role==='HEAD_ADMIN'||(moderation||[]).some(m=>m.active&&assigned.has(m.region_id)&&Array.isArray(m.permissions)&&m.permissions.includes('ANNOUNCEMENTS'));
    apply();
  }catch(error){console.warn('Dashboard-Zusatzfunktionen konnten nicht vollständig geladen werden:',error)}
}

function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;apply()});
}

function boot(){
  apply();
  void loadRights();
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{apply();void loadRights()},100));
  window.addEventListener('ec:community-announcements-refresh',()=>setTimeout(apply,80));
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeOverlay()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
