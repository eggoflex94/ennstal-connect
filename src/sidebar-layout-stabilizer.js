import { supabase } from './supabaseClient';

const ADMIN_ICONS={adminTools:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M9 18h6"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>',legal:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h14M6 7l-3 6h6L6 7Zm12 0-3 6h6l-3-6Z"/><path d="M7 21h10"/></svg>'};
const LABELS={adminTools:'Admin Tools',legal:'Beweissicherung'};
let currentRole='';
let running=false;
let bootAttempts=0;

function openTarget(target){
  document.body.classList.remove('ec-dock-open');
  if(target==='adminTools'){
    window.dispatchEvent(new CustomEvent('ec:open-admin-tools'));
    return;
  }
  if(target==='legal'){
    window.dispatchEvent(new CustomEvent('ec:open-legal-evidence'));
  }
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

function expectedTargets(){return currentRole==='HEAD_ADMIN'?['adminTools','legal']:[];}

function adminSlotIsCorrect(slot,targets){
  const children=[...slot.children];
  return children.length===targets.length&&targets.every((target,index)=>children[index]?.classList?.contains('ec-admin-icon-button')&&children[index].dataset.ecPage===target);
}

function removeLegacyAdminEntries(dock){
  dock.querySelectorAll('[data-ec-page="admin"], [data-key="admin-center"], [data-rf-nav="admin"].ec-duplicate-admin-center').forEach(node=>node.remove());
  dock.querySelectorAll('button,a,[role="button"]').forEach(node=>{
    const label=String(node.getAttribute('aria-label')||node.title||node.textContent||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[\s\-_]+/g,'');
    if(label.includes('adminzentrale')||label.includes('admincenter'))node.remove();
  });
  dock.querySelectorAll('.ec-dock-section-label, .ec-dock-admin-slot > *').forEach(node=>{
    if(/^administration$/i.test(String(node.textContent||'').trim()))node.remove();
  });
}

function stabilizeLayout(){
  const dock=document.querySelector('.ec-right-dock');
  if(!dock)return false;
  dock.classList.add('ec-stable-personal-dock');
  removeLegacyAdminEntries(dock);
  const slot=dock.querySelector('.ec-dock-admin-slot');
  if(slot){
    const targets=expectedTargets();
    if(!targets.length){if(slot.childElementCount)slot.replaceChildren();slot.hidden=true;}
    else{
      slot.hidden=false;
      slot.className='ec-dock-admin-slot ec-admin-icon-grid';
      if(!adminSlotIsCorrect(slot,targets))slot.replaceChildren(...targets.map(makeButton));
    }
  }
  return true;
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

function bootTick(){
  bootAttempts+=1;
  const ready=stabilizeLayout();
  if(ready||bootAttempts>=20)return;
  setTimeout(bootTick,250);
}

function refresh(){stabilizeLayout();void loadRole();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bootTick();void loadRole();},{once:true});else{bootTick();void loadRole();}
window.addEventListener('ec:navigate',()=>setTimeout(refresh,0));
window.addEventListener('ec:region-change',()=>setTimeout(refresh,50));
window.addEventListener('resize',()=>setTimeout(stabilizeLayout,80),{passive:true});
supabase?.auth?.onAuthStateChange?.(()=>setTimeout(refresh,80));
