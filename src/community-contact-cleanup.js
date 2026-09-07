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

  /* Any old contact row that repeats a person already present in the regional
     responsibility panel is superseded, regardless of its old panel heading. */
  document.querySelectorAll('.community-contact-sidebar .community-contact-row').forEach((row)=>{
    const nickname=normalize(row.querySelector('.role-author')?.textContent || row.querySelector('strong')?.textContent);
    if(represented.has(nickname))row.remove();
  });

  document.querySelectorAll('.community-contact-sidebar .panel').forEach((panel)=>{
    const rows=[...panel.querySelectorAll('.community-contact-row')];
    if(!rows.length)panel.dataset.ecSuperseded='true';
  });

  /* Remove older standalone responsibility/contact blocks below the new panel.
     Old variants used several slightly different phrases, so detect them by
     represented nickname + responsibility wording and/or role-star imagery. */
  const host=regionalPanel.closest('section,article,.card,.dashboard-card,.home-card,.panel')||regionalPanel.parentElement;
  if(host){
    [...host.querySelectorAll(':scope > div,:scope > section,:scope > article,:scope > aside')].forEach((node)=>{
      if(node===regionalPanel||node.contains(regionalPanel)||regionalPanel.contains(node))return;
      if(node.closest('.ec-team-panel'))return;
      const content=text(node);
      const normalized=normalize(content);
      const hasRepresented=[...represented].some((nickname)=>nickname&&normalized.includes(nickname));
      const responsibilityText=/Zuständig\s*für|Gesamtverantwortung|Community[- ]Moderation|Community[- ]Support|Datenschutz|Technischer Support|Einhaltung der Regeln|Sicherheit|regionale Inhalte|Gruppen[- ]Moderation/i.test(content);
      const hasRoleVisual=!!node.querySelector('img[src*="role-star-"],img[src*="supporter-star"],.ec-responsibility-star,.ec-role-person-star,.ec-global-role-star');
      if(hasRepresented&&(responsibilityText||hasRoleVisual)){node.remove();return;}
      if(/Zuständig\s*für\s*:/i.test(content)&&responsibilityText)node.remove();
    });
  }

  regionalPanel.querySelectorAll('.ec-region-responsibility-person').forEach((row)=>{
    const nickname=row.querySelector('.ec-region-responsibility-person-head strong');
    if(nickname)nickname.setAttribute('title','Profil öffnen');
  });

  window.dispatchEvent(new CustomEvent('ec:layout-refresh-requested'));
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
window.addEventListener('ec:navigate',schedule);
window.addEventListener('focus',schedule);
