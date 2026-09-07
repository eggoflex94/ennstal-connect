function text(node){return String(node?.textContent||'').replace(/\s+/g,' ').trim()}

function groupFor(label){
  if(/Warnung|Sperren|Freischalten|Verifizierung|Testkonto/i.test(label))return'safety';
  if(/Supporter|Community Admin|Rolle entfernen|Unternehmenskonto|Regional Admin/i.test(label))return'roles';
  if(/Rechte verwalten|Forum|Nachrichten|Anfragen|Gruppenmoderation/i.test(label))return'permissions';
  return'other';
}

function stabilizeProfile(page){
  if(!page)return;
  const clean=page.querySelector(':scope > .ec-clean-profile');
  if(clean){
    page.classList.add('ec-profile-final-clean');
    page.querySelectorAll(':scope > .member-profile-hero,:scope > .member-profile-actions,:scope > .profile-visible-details').forEach(node=>node.classList.add('ec-profile-final-hidden'));
    clean.querySelector('.ec-clean-profile-admin')?.remove();
  }

  const tools=page.querySelector(':scope > .member-admin-tools');
  if(!tools)return;
  tools.classList.add('ec-profile-final-admin-tools');
  tools.hidden=false;
  const wrap=tools.querySelector(':scope > div');
  if(!wrap)return;
  wrap.classList.add('ec-profile-final-admin-grid');

  const seen=new Set();
  [...wrap.querySelectorAll(':scope > button')].forEach(button=>{
    const label=text(button);
    if(!label)return;
    const key=label.toLowerCase();
    if(seen.has(key)){button.remove();return}
    seen.add(key);
    button.dataset.ecAdminGroup=groupFor(label);
    button.title=label;
  });

  let hint=tools.querySelector(':scope > .ec-profile-admin-hint');
  if(!hint){
    hint=document.createElement('p');
    hint.className='ec-profile-admin-hint';
    hint.textContent='Sicherheit, Rollen und Funktionsrechte dieses Mitglieds zentral verwalten.';
    tools.querySelector('h2')?.insertAdjacentElement('afterend',hint);
  }
}

function removePointPermission(){
  document.querySelectorAll('.permission-row').forEach(row=>{
    if(/Punkte verwalten/i.test(text(row)))row.remove();
  });
}

function run(){
  document.querySelectorAll('.member-profile-page').forEach(stabilizeProfile);
  removePointPermission();
}

let queued=false;
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:region-change',()=>setTimeout(run,50));
