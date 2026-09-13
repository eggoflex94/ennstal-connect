function hideNewsFinal(){
  const selector='nav button,nav a,[role="navigation"] button,[role="navigation"] a,header button,header a,.ec-top-nav button,.ec-top-nav a,.top-nav button,.top-nav a,.dashboard-top-nav button,.dashboard-top-nav a';
  document.querySelectorAll(selector).forEach((item)=>{
    if(String(item.textContent||'').trim().includes('Neuigkeiten'))item.style.setProperty('display','none','important');
  });
}
let observer=null;
function start(){hideNewsFinal();if(observer)return;observer=new MutationObserver(()=>hideNewsFinal());observer.observe(document.body,{childList:true,subtree:true});}
window.addEventListener('ec:navigate',hideNewsFinal);window.addEventListener('ec:region-change',hideNewsFinal);window.addEventListener('pageshow',hideNewsFinal);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
