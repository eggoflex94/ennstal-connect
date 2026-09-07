import { supabase } from './supabaseClient';

const ADMIN_ICONS={admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z"/><path d="M9 12h6M12 9v6"/></svg>',adminTools:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M9 18h6"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>',legal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h14M6 7l-3 6h6L6 7Zm12 0-3 6h6l-3-6Z"/><path d="M7 21h10"/></svg>'};
const LABELS={admin:'Admin-Zentrale',adminTools:'Admin Tools',legal:'Beweissicherung'};
let currentRole='';
let running=false;

function openTarget(target){
  document.body.classList.remove('ec-dock-open');
  if(target==='adminTools'){
    const entry=document.querySelector('.ec-admin-workspace-entry');
    if(entry){entry.click();return;}
    window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'admin'}}));
    setTimeout(()=>document.querySelector('.ec-admin-workspace-entry')?.click(),160);
    return;
  }
  if(target==='legal'){
    const entry=document.querySelector('.ec-legal-entry');
    if(entry){entry.click();return;}
  }
  window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:target==='legal'?'admin':target}}));
}

function makeButton(target){
  const button=document.createElement('button');
  button.type='button';
  button.dataset.ecPage=target;
  button.className='ec-admin-icon-button';
  button.title=LABELS[target];
  button.setAttribute('aria-label',LABELS[target]);
  button.innerHTML=`<span class="ec-admin-icon">${ADMIN_ICONS[target]}</span><span class="ec-admin-icon-label">${LABELS[target]}</span>`;
  button.addEventListener('click',()=>openTarget(target));
  return button;
}

function expectedTargets(){
  if(currentRole==='HEAD_ADMIN')return['admin','adminTools','legal'];
  if(currentRole==='ADMIN')return['admin'];
  return[];
}

function adminSlotIsCorrect(slot,targets){
  const buttons=[...slot.querySelectorAll(':scope > .ec-admin-icon-button')];
  if(buttons.length!==targets.length)return false;
  return targets.every((target,index)=>buttons[index]?.dataset.ecPage===target);
}

function ensureAdminDock(){
  const dock=document.querySelector('.ec-right-dock');
  const slot=dock?.querySelector('.ec-dock-admin-slot');
  if(!dock||!slot)return;
  const targets=expectedTargets();
  if(!targets.length){slot.replaceChildren();slot.hidden=true;slot.removeAttribute('data-ec-admin-signature');return;}
  slot.hidden=false;
  slot.className='ec-dock-admin-slot ec-admin-icon-grid';
  const signature=targets.join('|');
  if(slot.dataset.ecAdminSignature!==signature||!adminSlotIsCorrect(slot,targets)){
    slot.replaceChildren(...targets.map(makeButton));
    slot.dataset.ecAdminSignature=signature;
  }
  const communityLabel=[...dock.querySelectorAll(':scope > .ec-dock-section-label')].find(el=>/COMMUNITY/i.test(el.textContent||''));
  const communityDivider=communityLabel?.previousElementSibling;
  if(communityDivider&&slot.nextElementSibling!==communityDivider)communityDivider.parentElement.insertBefore(slot,communityDivider);
}

function removeNestedScroll(){
  const dock=document.querySelector('.ec-right-dock');
  if(!dock)return;
  dock.removeAttribute('tabindex');
  dock.style.setProperty('overflow','visible','important');
  dock.style.setProperty('height','auto','important');
  dock.style.setProperty('max-height','none','important');
  dock.querySelectorAll('.ec-dock-detail').forEach(panel=>{
    panel.style.setProperty('overflow','visible','important');
    panel.style.setProperty('max-height','none','important');
    panel.style.setProperty('height','auto','important');
  });
}

function reservePageHeight(){
  const dock=document.querySelector('.ec-right-dock');
  const main=document.querySelector('.modern-main');
  if(!dock||!main||window.innerWidth<=900)return;
  const needed=Math.max(720,Math.ceil(dock.scrollHeight+150));
  main.style.minHeight=`${needed}px`;
}

function stabilizeLayout(){
  const dock=document.querySelector('.ec-right-dock');
  if(!dock)return;
  dock.classList.add('ec-stable-personal-dock');
  ensureAdminDock();
  removeNestedScroll();
  requestAnimationFrame(reservePageHeight);
}

async function loadRole(){
  if(running||!supabase)return;
  running=true;
  try{
    const {data:auth}=await supabase.auth.getUser();
    const uid=auth?.user?.id;
    if(!uid)return;
    const {data}=await supabase.from('profiles').select('role').eq('id',uid).maybeSingle();
    currentRole=String(data?.role||'').toUpperCase();
    stabilizeLayout();
  }catch(error){console.warn('Dashboard-Rechte konnten nicht geladen werden:',error)}
  finally{running=false}
}

function boot(){
  stabilizeLayout();
  void loadRole();
  const observer=new MutationObserver(()=>{
    clearTimeout(window.__ecSidebarLayoutStabilizer);
    window.__ecSidebarLayoutStabilizer=setTimeout(stabilizeLayout,70);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{stabilizeLayout();void loadRole();},50));
  window.addEventListener('resize',()=>setTimeout(stabilizeLayout,80),{passive:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
