const PAGE_BY_LABEL={
  'Mein Profil':'profile',
  'Nachrichten':'messages',
  'Freunde':'friends',
  'Anfragen':'requests',
  'Blockiert':'blocked',
  'Hilfe':'help'
};

function labelOf(button){
  return String(button?.dataset?.ecCompactLabel||button?.getAttribute('aria-label')||button?.title||button?.textContent||'').replace(/\s+/g,' ').trim();
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

function wireProfileRows(){
  document.querySelectorAll('.ec-dock-detail-row[data-profile-id],.ec-online-friend[data-profile-id]').forEach(row=>{
    const profileId=row.dataset.profileId;
    if(!profileId)return;
    row.classList.add('ec-profile-row-link');
    const name=row.querySelector('strong,.ec-online-friend-name');
    if(name){
      name.classList.add('ec-profile-nickname-link');
      name.setAttribute('role','link');
      name.setAttribute('tabindex','0');
      if(name.dataset.ecProfileLinkBound!=='1'){
        const open=event=>{
          event.preventDefault();event.stopPropagation();
          window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId}}));
          document.body.classList.remove('ec-dock-open');
        };
        name.addEventListener('click',open);
        name.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ' )open(event)});
        name.dataset.ecProfileLinkBound='1';
      }
    }
  });
}

function stabilize(){
  hideRawLegalPanels();
  closeStrayAdminWorkspaces();
  wireMenu();
  wireProfileRows();
}

function boot(){
  stabilize();
  const observer=new MutationObserver(()=>{
    clearTimeout(window.__ecSidebarInteractionFix);
    window.__ecSidebarInteractionFix=setTimeout(stabilize,50);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(stabilize,60));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
