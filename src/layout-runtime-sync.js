/* Event-driven layout geometry sync. No full-page MutationObserver. */
let frame=0;
let settleTimer=0;
let lastSignature='';
let resizeObserver=null;

function px(value,fallback){const n=Math.round(Number(value)||0);return n>0?n:fallback}
function sync(){
  frame=0;
  const mast=document.querySelector('.ec-brand-masthead');
  const nav=document.querySelector('.ec-top-nav');
  const mastH=px(mast?.getBoundingClientRect().height,74);
  const navH=px(nav?.getBoundingClientRect().height,56);
  const shellBottom=mastH+navH;
  const desktop=window.matchMedia('(min-width:901px)').matches;
  const pageTop=desktop?shellBottom+24:shellBottom+14;
  const dockTop=desktop?shellBottom+18:shellBottom+10;
  const root=document.documentElement;
  root.style.setProperty('--ec-shell-bottom',`${shellBottom}px`);
  root.style.setProperty('--ec-page-top',`${pageTop}px`);
  root.style.setProperty('--ec-dock-top',`${dockTop}px`);
  root.classList.add('ec-layout-synced');
  const main=document.querySelector('.modern-main');
  const content=document.querySelector('.content-root');
  const dock=document.querySelector('.ec-right-dock');
  const signature=[window.innerWidth,window.innerHeight,mastH,navH,main?.children.length||0,content?.children.length||0,!!dock].join(':');
  if(signature!==lastSignature){
    lastSignature=signature;
    window.dispatchEvent(new CustomEvent('ec:layout-synced',{detail:{mastH,navH,shellBottom,pageTop,dockTop}}));
  }
}
function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(sync);
  clearTimeout(settleTimer);
  settleTimer=setTimeout(sync,60);
}
function observeKnownNodes(){
  resizeObserver?.disconnect();
  resizeObserver=new ResizeObserver(schedule);
  ['.ec-brand-masthead','.ec-top-nav','.modern-main','.content-root','.ec-right-dock'].forEach(selector=>{const node=document.querySelector(selector);if(node)resizeObserver.observe(node)});
}
function refreshStructure(){observeKnownNodes();schedule()}
function boot(){
  refreshStructure();
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  window.addEventListener('pageshow',refreshStructure);
  ['ec:navigate','ec:region-change','ec:business-account-changed','ec:profile-image-updated','ec:network-restored'].forEach(name=>window.addEventListener(name,refreshStructure));
  document.fonts?.ready?.then(refreshStructure).catch(()=>{});
  setTimeout(refreshStructure,250);
  setTimeout(refreshStructure,900);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
