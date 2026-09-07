function profileHref(profileId){
  const url=new URL(window.location.href);
  url.searchParams.set('profile',profileId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function openProfile(profileId,nickname=''){
  if(!profileId)return false;
  window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId,nickname}}));
  document.body.classList.remove('ec-dock-open');
  return true;
}

function bindNativeLink(link,profileId,nickname=''){
  if(!link||!profileId)return;
  link.href=profileHref(profileId);
  link.dataset.profileId=profileId;
  if(link.dataset.ecReliableProfileLink==='1')return;
  link.dataset.ecReliableProfileLink='1';
  link.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();
    event.stopPropagation();
    const href=link.href;
    openProfile(profileId,nickname||link.textContent.trim());
    window.setTimeout(()=>{
      const openPage=document.querySelector(`.member-profile-page[data-profile-id="${CSS.escape(profileId)}"]`);
      const ownProfile=document.querySelector('.profile-page,.profile-page-layout,.ec-clean-editor');
      if(!openPage&&!ownProfile)window.location.assign(href);
    },350);
  });
}

function ensureNicknameLink(container,profileId,selector){
  if(!container||!profileId)return;
  let current=container.querySelector(selector);
  if(!current)return;
  let link=current.matches('a.ec-profile-native-link')?current:current.querySelector?.('a.ec-profile-native-link');
  if(!link){
    link=document.createElement('a');
    link.className='ec-profile-native-link';
    link.textContent=current.textContent.trim();
    if(current.matches('strong,.ec-online-friend-name'))current.replaceWith(link);else current.replaceChildren(link);
  }
  bindNativeLink(link,profileId,link.textContent.trim());
}

function normalizeOnlineFriends(){
  document.querySelectorAll('.ec-online-friends-panel').forEach(panel=>{
    panel.classList.add('ec-online-friends-text-only');
    panel.querySelectorAll('.ec-online-friend[data-profile-id]').forEach(row=>{
      row.querySelectorAll('img').forEach(img=>{
        if(!img.classList.contains('ec-online-friend-star')&&!img.classList.contains('ec-role-person-star'))img.remove();
      });
      const id=row.dataset.profileId;
      row.type='button';
      row.setAttribute('aria-label',`Profil von ${(row.querySelector('.ec-online-friend-name,.ec-profile-native-link')?.textContent||'Mitglied').trim()} öffnen`);
      ensureNicknameLink(row,id,'.ec-online-friend-name,.ec-profile-native-link');
    });
  });
}

function linkResponsibilityPeople(){
  document.querySelectorAll('.ec-region-responsibility-person[data-profile-id]').forEach(card=>{
    const id=card.dataset.profileId;
    const head=card.querySelector('.ec-region-responsibility-person-head');
    if(!head)return;
    head.classList.add('ec-profile-link');
    ensureNicknameLink(head,id,'strong,.ec-profile-native-link');
  });
  document.querySelectorAll('.ec-role-person[data-profile-id]').forEach(person=>{
    person.classList.add('ec-profile-link');
    ensureNicknameLink(person,person.dataset.profileId,'strong,.ec-profile-native-link');
  });
}

function linkDashboardActivity(){
  document.querySelectorAll('.ec-dock-detail-row[data-profile-id]').forEach(row=>{
    const id=row.dataset.profileId;
    if(!id)return;
    ensureNicknameLink(row,id,'strong,.ec-profile-native-link');
  });
}

function delegatedProfileClick(event){
  const link=event.target.closest?.('a.ec-profile-native-link[data-profile-id]');
  if(link)return;
  const target=event.target.closest?.('.ec-online-friend[data-profile-id],.ec-region-responsibility-person[data-profile-id],.ec-role-person[data-profile-id],.ec-dock-detail-row[data-profile-id]');
  if(!target)return;
  const id=target.dataset.profileId;
  const native=target.querySelector('a.ec-profile-native-link');
  if(native){native.click();event.preventDefault();event.stopPropagation();}
  else openProfile(id);
}

function polish(){normalizeOnlineFriends();linkResponsibilityPeople();linkDashboardActivity()}
function boot(){
  polish();
  document.addEventListener('click',delegatedProfileClick,true);
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecPeopleLinksPolish);window.__ecPeopleLinksPolish=setTimeout(polish,70)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(polish,90));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
