import { supabase } from './supabaseClient';

const ITEMS={
  admin:{label:'Admin-Zentrale',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>'},
  adminTools:{label:'Admin Tools',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M9 18h6"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="12" cy="18" r="2"/></svg>'},
  legal:{label:'Beweissicherung',icon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h14M6 7l-3 6h6L6 7Zm12 0-3 6h6l-3-6Z"/><path d="M7 21h10"/></svg>'}
};
let role='';
let timer=null;
let slotObserver=null;
let observedSlot=null;

function activate(target){
  document.body.classList.remove('ec-dock-open');
  if(target==='admin')window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'admin'}}));
  if(target==='adminTools')window.dispatchEvent(new CustomEvent('ec:open-admin-tools'));
  if(target==='legal')window.dispatchEvent(new CustomEvent('ec:open-legal-evidence'));
}

function buttonFor(target){
  const cfg=ITEMS[target];
  const button=document.createElement('button');
  button.type='button';
  button.dataset.ecPage=target;
  button.dataset.ecAdminPrimary='1';
  button.dataset.ecCompactLabel=cfg.label;
  button.className='ec-compact-menu-item ec-admin-primary-shortcut';
  button.title=cfg.label;
  button.setAttribute('aria-label',cfg.label);
  button.innerHTML=`<span class="ec-compact-menu-icon">${cfg.icon}</span><span class="ec-compact-menu-label">${cfg.label}</span>`;
  button.addEventListener('click',()=>activate(target));
  return button;
}

function ensureStyle(){
  if(document.getElementById('ec-admin-placement-final-style'))return;
  const style=document.createElement('style');
  style.id='ec-admin-placement-final-style';
  style.textContent=`
    .ec-right-dock .ec-compact-menu-grid .ec-admin-primary-shortcut{display:flex!important;align-items:center!important;justify-content:center!important;min-width:0!important}
    .ec-right-dock .ec-compact-menu-grid .ec-admin-primary-shortcut .ec-compact-menu-icon{display:grid!important;place-items:center!important}
    .ec-right-dock .ec-compact-menu-grid .ec-admin-primary-shortcut .ec-compact-menu-icon svg{width:22px!important;height:22px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.9!important;stroke-linecap:round!important;stroke-linejoin:round!important}
    .ec-right-dock .ec-dock-admin-slot{display:none!important}
  `;
  document.head.appendChild(style);
}

function expectedTargets(){
  if(role==='HEAD_ADMIN')return['admin','adminTools','legal'];
  if(role==='ADMIN')return['admin'];
  return[];
}

function gridIsCorrect(grid,targets){
  const adminButtons=[...grid.querySelectorAll(':scope > [data-ec-admin-primary="1"]')];
  return adminButtons.length===targets.length&&targets.every((target,index)=>adminButtons[index]?.dataset.ecPage===target);
}

function watchLegacySlot(slot){
  if(!slot||observedSlot===slot)return;
  slotObserver?.disconnect();
  observedSlot=slot;
  slotObserver=new MutationObserver(()=>{
    if(slot.childElementCount>0||!slot.hidden) schedule(1);
  });
  slotObserver.observe(slot,{childList:true});
}

function clearLegacyArea(dock,slot){
  if(slot){
    if(slot.childElementCount)slot.replaceChildren();
    slot.hidden=true;
    watchLegacySlot(slot);
  }
  dock.querySelectorAll('.ec-dock-section-label').forEach(label=>{
    const value=String(label.textContent||'').trim().toUpperCase();
    if(value==='ADMINISTRATION'||value==='ADMIN TOOLS')label.remove();
  });
}

function place(){
  const dock=document.querySelector('.ec-right-dock');
  const grid=dock?.querySelector('.ec-compact-menu-grid');
  if(!dock||!grid)return false;
  ensureStyle();

  const targets=expectedTargets();
  const slot=dock.querySelector('.ec-dock-admin-slot');

  dock.querySelectorAll('[data-ec-admin-primary="1"]').forEach(node=>{
    if(node.parentElement!==grid)node.remove();
  });

  if(!gridIsCorrect(grid,targets)){
    grid.querySelectorAll(':scope > [data-ec-admin-primary="1"]').forEach(node=>node.remove());
    grid.querySelectorAll(':scope > [data-ec-page="admin"],:scope > [data-ec-page="adminTools"],:scope > [data-ec-page="legal"]').forEach(node=>node.remove());
    targets.forEach(target=>grid.appendChild(buttonFor(target)));
  }

  clearLegacyArea(dock,slot);
  return true;
}

async function loadRole(){
  if(!supabase)return;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){role='';place();return;}
    const {data}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
    role=String(data?.role||'').toUpperCase();
    place();
  }catch(error){console.warn('Admin-Zugänge konnten nicht eingeordnet werden:',error);}
}

function schedule(retries=12){
  clearTimeout(timer);
  const run=(left)=>{
    if(place()||left<=0)return;
    timer=setTimeout(()=>run(left-1),160);
  };
  timer=setTimeout(()=>run(retries),80);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void loadRole();schedule();},{once:true});
else{void loadRole();schedule();}
window.addEventListener('ec:navigate',()=>schedule(6));
window.addEventListener('ec:region-change',()=>schedule(6));
window.addEventListener('resize',()=>schedule(2),{passive:true});
window.addEventListener('focus',()=>schedule(2));
supabase?.auth?.onAuthStateChange?.(()=>setTimeout(()=>void loadRole(),120));
