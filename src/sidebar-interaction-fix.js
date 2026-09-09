import { supabase } from './supabaseClient';

const PAGE_BY_LABEL={
  'Mein Profil':'profile',
  'Nachrichten':'messages',
  'Freunde':'friends',
  'Anfragen':'requests',
  'Blockiert':'blocked',
  'Hilfe':'help'
};

let profilesByName=new Map();
let profileDirectoryLoadedAt=0;
let profileDirectoryPromise=null;

function norm(value){return String(value||'').replace(/[★♛♥✓]/g,'').replace(/\s+/g,' ').trim().toLowerCase()}
function labelOf(button){return String(button?.dataset?.ecCompactLabel||button?.getAttribute('aria-label')||button?.title||button?.textContent||'').replace(/\s+/g,' ').trim();}

async function loadProfileDirectory(force=false){
  if(!supabase)return profilesByName;
  if(!force&&profilesByName.size&&Date.now()-profileDirectoryLoadedAt<120000)return profilesByName;
  if(profileDirectoryPromise)return profileDirectoryPromise;
  profileDirectoryPromise=(async()=>{
    try{
      const {data,error}=await supabase.from('profiles').select('id,nickname,account_status').eq('account_status','ACTIVE');
      if(error)throw error;
      profilesByName=new Map((data||[]).filter(p=>p?.id&&p?.nickname).map(p=>[norm(p.nickname),p]));
      profileDirectoryLoadedAt=Date.now();
      return profilesByName;
    }catch(error){
      console.warn('Sidebar-Profile konnten nicht vollständig geladen werden:',error?.message||error);
      return profilesByName;
    }finally{profileDirectoryPromise=null}
  })();
  return profileDirectoryPromise;
}

function closeStrayAdminWorkspaces(){
  const all=[...document.querySelectorAll('.ec-admin-workspace')];
  if(all.length<=1)return;
  all.slice(0,-1).forEach(node=>node.remove());
}

function hideRawLegalPanels(){
  document.querySelectorAll('.ec-legal-entry').forEach(node=>node.classList.add('ec-admin-tool-hidden'));
}

function wireMenu(){
  const dock=document.querySelector('.ec-right-dock');
  if(!dock)return;
  dock.querySelectorAll('.ec-compact-menu-item').forEach(button=>{
    const label=labelOf(button);
    if(label==='Einstellungen'){
      button.hidden=true;
      button.setAttribute('aria-hidden','true');
      return;
    }
    if(button.dataset.ecInteractionFixed==='1')return;
    button.dataset.ecInteractionFixed='1';
    if(label==='Benachrichtigungen'){
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('ec:open-notifications'));
      },true);
      return;
    }
    if(PAGE_BY_LABEL[label]){
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:PAGE_BY_LABEL[label]}}));
        document.body.classList.remove('ec-dock-open');
      },true);
    }
  });
}

function profileIdForRow(row,nameNode){
  const explicit=row?.dataset?.profileId||row?.dataset?.profile||nameNode?.dataset?.profileId||'';
  if(explicit)return explicit;
  const name=norm(nameNode?.textContent||row?.querySelector?.('strong,.ec-online-friend-name,.ec-rf-name,.ec-profile-link')?.textContent);
  return profilesByName.get(name)?.id||'';
}

function openProfile(profileId,event){
  if(!profileId)return;
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.stopImmediatePropagation?.();
  window.__ecPendingProfile={profileId};
  window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId}}));
  document.body.classList.remove('ec-dock-open');
}

function wireProfileRows(){
  const selectors=[
    '.ec-right-dock .ec-dock-detail-row',
    '.ec-right-dock .ec-online-friend',
    '.ec-right-dock .ec-sidebar-name-row',
    '.ec-sidebar-refactor [data-profile]',
    '.ec-sidebar-shell .ec-profile-link'
  ].join(',');
  document.querySelectorAll(selectors).forEach(row=>{
    const name=row.matches('.ec-profile-link')?row:row.querySelector('strong,.ec-online-friend-name,.ec-rf-name,.ec-profile-link');
    if(!name)return;
    const profileId=profileIdForRow(row,name);
    if(!profileId)return;
    row.dataset.profileId=profileId;
    name.dataset.profileId=profileId;
    row.classList.add('ec-profile-row-link');
    name.classList.add('ec-profile-nickname-link');
    name.setAttribute('role','link');
    name.setAttribute('tabindex','0');
    name.setAttribute('aria-label',`Profil von ${String(name.textContent||'Mitglied').trim()} öffnen`);
    name.title='Profil öffnen';
    if(name.dataset.ecProfileLinkBound==='1')return;
    const open=event=>openProfile(profileId,event);
    name.addEventListener('click',open,true);
    name.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){open(event)}});
    name.dataset.ecProfileLinkBound='1';
  });
}

function stabilize(){
  hideRawLegalPanels();
  closeStrayAdminWorkspaces();
  wireMenu();
  wireProfileRows();
}

let queued=false;
function scheduleStabilize(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
    queued=false;
    stabilize();
  });
}

async function boot(){
  await loadProfileDirectory();
  stabilize();
  const observer=new MutationObserver(scheduleStabilize);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>{void loadProfileDirectory(true).then(stabilize)});
  window.addEventListener('focus',()=>{void loadProfileDirectory(false).then(stabilize)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
