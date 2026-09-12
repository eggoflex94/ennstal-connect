/* Lightweight runtime guardrails. No full-page MutationObserver. */
const NETWORK_RE=/failed to fetch|networkerror|network request failed|load failed|fetch failed/i;
let queued=false;
let networkToast=null;

function showToast(text,type='info',timeout=5200){
  document.querySelector('.ec-runtime-toast')?.remove();
  const node=document.createElement('div');
  node.className=`ec-runtime-toast is-${type}`;
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  node.textContent=text;
  document.body.appendChild(node);
  clearTimeout(networkToast);
  networkToast=setTimeout(()=>node.remove(),timeout);
}

function normalizeRoleStars(root=document){
  root.querySelectorAll?.('img[src*="role-star-member.svg"]').forEach(img=>img.remove());
  root.querySelectorAll?.('img[src*="role-star-red.svg"]').forEach(img=>img.classList.add('ec-role-star-admin-glow'));
}
function stabilizeImages(root=document){
  root.querySelectorAll?.('img').forEach(img=>{
    if(!img.hasAttribute('decoding'))img.decoding='async';
    if(!img.hasAttribute('loading')&&!img.classList.contains('my-avatar')&&!img.classList.contains('member-avatar'))img.loading='lazy';
    if(img.dataset.ecErrorBound==='1')return;
    img.dataset.ecErrorBound='1';
    img.addEventListener('error',()=>{
      const src=String(img.getAttribute('src')||'');
      if(/role-star|supporter-star|badge-/i.test(src)){img.style.display='none';return}
      if(/avatar|profile|member/i.test(`${img.className} ${img.alt}`)&&!src.includes('community-default-avatar.png'))img.src='/community-default-avatar.png';
    });
  });
}
function repairScrollLocks(){
  [['ec-dashboard-info-open','.ec-dashboard-info-overlay'],['ec-popup-admin-editing','.ec-popup-admin-editor'],['ec-notifications-open','.ec-notification-overlay'],['ec-admin-hours-open','.ec-admin-hours-overlay']].forEach(([bodyClass,selector])=>{if(!document.querySelector(selector))document.body.classList.remove(bodyClass)});
}
function stabilizeClickableElements(root=document){
  root.querySelectorAll?.('button,a,[role="button"]').forEach(el=>{
    if(el instanceof HTMLButtonElement&&!el.getAttribute('type')&&!el.closest('form'))el.type='button';
    if(!el.hasAttribute('tabindex')&&el.getAttribute('role')==='button')el.tabIndex=0;
  });
}
function apply(root=document){normalizeRoleStars(root);stabilizeImages(root);repairScrollLocks();stabilizeClickableElements(root)}
function schedule(root=document){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply(root)})}
function networkMessage(error){return String(error?.message||error?.reason?.message||error?.reason||'')}
function onOffline(){showToast('Verbindung unterbrochen. Ennstal Connect bleibt geöffnet und verbindet sich automatisch erneut.','warning',8000)}
function onOnline(){showToast('Verbindung wiederhergestellt.','success',2800);window.dispatchEvent(new CustomEvent('ec:network-restored'));window.dispatchEvent(new CustomEvent('ec:community-announcements-refresh'))}
function boot(){
  apply();
  window.addEventListener('ec:navigate',()=>schedule(document.querySelector('.content-root')||document));
  window.addEventListener('ec:region-change',()=>schedule(document.querySelector('.content-root')||document));
  window.addEventListener('focus',()=>schedule(document.querySelector('.content-root')||document));
  window.addEventListener('offline',onOffline);
  window.addEventListener('online',onOnline);
  window.addEventListener('unhandledrejection',event=>{if(NETWORK_RE.test(networkMessage(event)))showToast('Eine Verbindung ist fehlgeschlagen. Bitte kurz erneut versuchen.','warning',6500)});
  window.addEventListener('error',event=>{if(NETWORK_RE.test(String(event?.message||'')))showToast('Eine Verbindung ist fehlgeschlagen. Bitte kurz erneut versuchen.','warning',6500)});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const top=document.querySelector('.ec-dashboard-info-overlay,.ec-notification-overlay,.ec-popup-admin-editor,.ec-admin-hours-overlay,.ec-popup-manager-overlay');top?.querySelector('[data-close],.ec-dashboard-info-close,.ec-notification-close,.ec-popup-manager-close,.ec-admin-hours-close')?.click()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){repairScrollLocks();window.dispatchEvent(new CustomEvent('ec:network-restored'))}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
