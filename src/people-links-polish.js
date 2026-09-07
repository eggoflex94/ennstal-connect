function profileHref(profileId){
  return `/?profile=${encodeURIComponent(profileId)}`;
}

function bindLink(link,profileId){
  if(!link||!profileId)return;
  link.href=profileHref(profileId);
  link.dataset.profileId=profileId;
}

function makeVisualLink(container,profileId,selector){
  if(!container||!profileId)return;
  const current=container.querySelector(selector);
  if(!current)return;
  if(current.matches('a.ec-profile-native-link')){bindLink(current,profileId);return;}
  const link=document.createElement('a');
  link.className='ec-profile-native-link';
  link.textContent=current.textContent.trim();
  bindLink(link,profileId);
  if(current.matches('.ec-online-friend-name'))current.replaceWith(link);else current.replaceChildren(link);
}

function makeDockIdentityLink(row,profileId){
  const strong=row.querySelector('span>strong');
  if(!strong||!profileId)return;
  let link=strong.querySelector('a.ec-profile-native-link');
  if(!link){
    const text=[...strong.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(' ').trim();
    [...strong.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).forEach(node=>node.remove());
    link=document.createElement('a');
    link.className='ec-profile-native-link ec-dock-profile-link';
    link.textContent=text||'Mitglied';
    strong.appendChild(link);
  }
  bindLink(link,profileId);
}

function normalizeOnlineFriends(){
  document.querySelectorAll('.ec-online-friends-panel').forEach(panel=>{
    panel.classList.add('ec-online-friends-text-only');
    panel.querySelectorAll('.ec-online-friend[data-profile-id]').forEach(row=>{
      row.querySelectorAll('img').forEach(img=>{
        if(!img.classList.contains('ec-online-friend-star')&&!img.classList.contains('ec-role-person-star'))img.remove();
      });
      const id=row.dataset.profileId;
      row.dataset.profileHref=profileHref(id);
      row.setAttribute('aria-label',`Profil von ${(row.querySelector('.ec-online-friend-name,.ec-profile-native-link')?.textContent||'Mitglied').trim()} öffnen`);
      makeVisualLink(row,id,'.ec-online-friend-name,.ec-profile-native-link');
    });
  });
}

function linkResponsibilityPeople(){
  document.querySelectorAll('.ec-region-responsibility-person[data-profile-id]').forEach(card=>{
    const id=card.dataset.profileId;
    const head=card.querySelector('.ec-region-responsibility-person-head');
    if(!head)return;
    card.dataset.profileHref=profileHref(id);
    head.classList.add('ec-profile-link');
    makeVisualLink(head,id,'strong,.ec-profile-native-link');
  });
  document.querySelectorAll('.ec-role-person[data-profile-id]').forEach(person=>{
    const id=person.dataset.profileId;
    person.dataset.profileHref=profileHref(id);
    person.classList.add('ec-profile-link');
    makeVisualLink(person,id,'strong,.ec-profile-native-link');
  });
}

function linkDashboardActivity(){
  document.querySelectorAll('.ec-dock-detail-row[data-profile-id]').forEach(row=>{
    const id=row.dataset.profileId;
    if(!id)return;
    row.dataset.profileHref=profileHref(id);
    makeDockIdentityLink(row,id);
  });
}

function hardProfileNavigation(event){
  if(event.type==='click'&&(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;
  const target=event.target.closest?.('a.ec-profile-native-link[data-profile-id],.ec-online-friend[data-profile-id],.ec-region-responsibility-person[data-profile-id],.ec-role-person[data-profile-id],.ec-dock-detail-row[data-profile-id]');
  if(!target)return;
  const id=target.dataset.profileId||target.closest?.('[data-profile-id]')?.dataset.profileId;
  if(!id)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  document.body.classList.remove('ec-dock-open');
  window.location.assign(profileHref(id));
}

function polish(){normalizeOnlineFriends();linkResponsibilityPeople();linkDashboardActivity()}
function boot(){
  polish();
  document.addEventListener('click',hardProfileNavigation,true);
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecPeopleLinksPolish);window.__ecPeopleLinksPolish=setTimeout(polish,70)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(polish,90));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
