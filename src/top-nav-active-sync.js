const PAGE_KEY='ec-current-page';
const TOP_PAGES=new Set(['home','members','forum','groups','events','news','community','support','help']);

function normalized(page){
  const value=String(page||'').trim();
  if(value==='help')return'support';
  return TOP_PAGES.has(value)?value:'';
}

function ensureStyle(){
  if(document.getElementById('ec-top-nav-active-style'))return;
  const style=document.createElement('style');
  style.id='ec-top-nav-active-style';
  style.textContent=`
    .ec-top-nav [data-ec-page]{background:transparent!important;color:#0b2e62!important;box-shadow:none!important;border-color:transparent!important}
    .ec-top-nav [data-ec-page].is-active,.ec-top-nav [data-ec-page][aria-current="page"]{background:linear-gradient(180deg,#0c79e8,#075fc2)!important;color:#fff!important;box-shadow:0 8px 18px rgba(0,91,190,.22)!important;border-color:#0b6dcc!important}
    .ec-top-nav [data-ec-page].is-active b,.ec-top-nav [data-ec-page].is-active span,.ec-top-nav [data-ec-page][aria-current="page"] b,.ec-top-nav [data-ec-page][aria-current="page"] span{color:#fff!important}
  `;
  document.head.appendChild(style);
}

function setActive(page,persist=true){
  const wanted=normalized(page);
  if(!wanted)return false;
  ensureStyle();
  const nav=document.querySelector('.ec-top-nav');
  if(!nav)return false;
  nav.querySelectorAll('[data-ec-page]').forEach((button)=>{
    const active=normalized(button.dataset.ecPage)===wanted;
    button.classList.toggle('is-active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  if(persist)sessionStorage.setItem(PAGE_KEY,wanted);
  return true;
}

function inferFromDom(){
  if(document.querySelector('.community-hub'))return'community';
  if(document.querySelector('.forum-page,.forum-layout,.forum-board'))return'forum';
  if(document.querySelector('.groups-page,.groups-grid,.community-groups-page'))return'groups';
  if(document.querySelector('.events-page,.events-grid,.community-events-page'))return'events';
  if(document.querySelector('.news-page,.news-grid,.community-news-page'))return'news';
  if(document.querySelector('.members-page,.member-grid,.members-grid,.native-member-grid'))return'members';
  const heading=[...document.querySelectorAll('.page-heading h1,.page-heading h2,main h1,main>.eyebrow')].find((el)=>el.offsetParent!==null)?.textContent?.trim().toLowerCase()||'';
  if(heading.includes('community'))return'community';
  if(heading.includes('mitglied'))return'members';
  if(heading.includes('forum'))return'forum';
  if(heading.includes('gruppe'))return'groups';
  if(heading.includes('event')||heading.includes('veranstaltung'))return'events';
  if(heading.includes('neuigkeit'))return'news';
  if(heading.includes('support')||heading.includes('hilfe'))return'support';
  if(heading.includes('start'))return'home';
  return'';
}

function syncFromDom(){
  const inferred=inferFromDom();
  if(inferred)return setActive(inferred,true);
  const saved=sessionStorage.getItem(PAGE_KEY);
  if(saved)return setActive(saved,false);
  return setActive('home',false);
}

let timer=null;
function schedule(){
  clearTimeout(timer);
  timer=setTimeout(syncFromDom,40);
}

window.addEventListener('ec:navigate',(event)=>{
  const page=normalized(event.detail?.page);
  if(page)setActive(page,true);
  setTimeout(syncFromDom,80);
});
window.addEventListener('ec:region-change',schedule);
window.addEventListener('popstate',schedule);
window.addEventListener('focus',schedule);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{schedule();setTimeout(syncFromDom,220);},{once:true});
else{schedule();setTimeout(syncFromDom,220);}
