function openProfile(profileId){
  if(!profileId)return;
  window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId}}));
  document.body.classList.remove('ec-dock-open');
}

function normalizeOnlineFriends(){
  document.querySelectorAll('.ec-online-friends-panel').forEach(panel=>{
    panel.classList.add('ec-online-friends-text-only');
    panel.querySelectorAll('.ec-online-friend').forEach(row=>{
      row.querySelectorAll('img').forEach(img=>{
        if(!img.classList.contains('ec-online-friend-star')&&!img.classList.contains('ec-role-person-star'))img.remove();
      });
      const id=row.dataset.profileId;
      row.type='button';
      row.setAttribute('aria-label',`Profil von ${(row.querySelector('.ec-online-friend-name')?.textContent||'Mitglied').trim()} öffnen`);
      row.onclick=()=>openProfile(id);
    });
  });
}

function linkResponsibilityPeople(){
  document.querySelectorAll('.ec-region-responsibility-person[data-profile-id]').forEach(card=>{
    const id=card.dataset.profileId;
    const head=card.querySelector('.ec-region-responsibility-person-head');
    if(!head)return;
    head.classList.add('ec-profile-link');
    head.setAttribute('role','button');
    head.tabIndex=0;
    head.setAttribute('aria-label',`Profil von ${(head.querySelector('strong')?.textContent||'Mitglied').trim()} öffnen`);
    head.onclick=()=>openProfile(id);
    head.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile(id)}};
  });
  document.querySelectorAll('.ec-role-person[data-profile-id]').forEach(person=>{
    const id=person.dataset.profileId;
    person.classList.add('ec-profile-link');
    person.setAttribute('role','button');
    person.tabIndex=0;
    person.onclick=()=>openProfile(id);
    person.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile(id)}};
  });
}

function polish(){normalizeOnlineFriends();linkResponsibilityPeople()}
function boot(){polish();const observer=new MutationObserver(()=>{clearTimeout(window.__ecPeopleLinksPolish);window.__ecPeopleLinksPolish=setTimeout(polish,70)});observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('ec:region-change',()=>setTimeout(polish,90));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
