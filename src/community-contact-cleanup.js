function text(node){return String(node?.textContent||'').trim();}
function normalize(value){return String(value||'').trim().toLowerCase();}

function cleanupCommunityContacts(){
  const regionalPanel=document.querySelector('.ec-team-panel[data-ec-regional-responsibilities="true"]');
  if(!regionalPanel)return;

  const represented=new Set(
    [...regionalPanel.querySelectorAll('.ec-region-responsibility-person')]
      .map((row)=>normalize(row.querySelector('.ec-region-responsibility-person-head strong')?.textContent))
      .filter(Boolean)
  );

  document.querySelectorAll('.community-contact-sidebar .panel').forEach((panel)=>{
    const heading=text(panel.querySelector('h1,h2,h3,h4'));
    if(!/^(Administration|Forum\s*&\s*Gruppen)$/i.test(heading))return;

    panel.querySelectorAll('.community-contact-row').forEach((row)=>{
      const nickname=normalize(row.querySelector('.role-author')?.textContent || row.querySelector('strong')?.textContent);
      if(represented.has(nickname))row.remove();
    });

    const remaining=panel.querySelector('.community-contact-row');
    const meaningful=[...panel.children].some((child)=>child.matches?.('.community-contact-row'));
    if(!remaining && !meaningful)panel.dataset.ecSuperseded='true';
  });

  /* Remove the older standalone responsibility card that can still be rendered
     below the new regional responsibility panel. It duplicates the same person
     and begins with "Zuständig für". */
  const host=regionalPanel.closest('section,article,.card,.dashboard-card,.home-card,.panel')||regionalPanel.parentElement;
  if(host){
    [...host.querySelectorAll(':scope > div,:scope > section,:scope > article,:scope > aside')].forEach((node)=>{
      if(node===regionalPanel||node.contains(regionalPanel)||regionalPanel.contains(node))return;
      if(node.closest('.ec-team-panel'))return;
      const content=text(node);
      if(!/Zuständig\s*für\s*:/i.test(content))return;
      const hasRepresented=[...represented].some((nickname)=>nickname&&normalize(content).includes(nickname));
      if(hasRepresented){node.remove();return;}
      if(/Datenschutz|Technischer Support|Einhaltung der Regeln|Sicherheit|Community-Verwaltung/i.test(content))node.remove();
    });
  }

  regionalPanel.querySelectorAll('.ec-region-responsibility-person').forEach((row)=>{
    const nickname=row.querySelector('.ec-region-responsibility-person-head strong');
    if(nickname)nickname.setAttribute('title','Profil öffnen');
  });
}

let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;cleanupCommunityContacts();});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',schedule);
window.addEventListener('focus',schedule);
