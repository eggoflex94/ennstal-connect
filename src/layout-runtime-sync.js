/* Keeps layout geometry synchronized after React/runtime modules modify the page. */
let frame=0;
let settleTimer=0;
let lastSignature='';

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
  settleTimer=setTimeout(()=>{sync();setTimeout(sync,120)},40);
}

function boot(){
  schedule();
  const resize=new ResizeObserver(schedule);
  ['.ec-brand-masthead','.ec-top-nav','.modern-main','.content-root','.ec-right-dock'].forEach(selector=>{
    const node=document.querySelector(selector);if(node)resize.observe(node);
  });
  const mutation=new MutationObserver(schedule);
  mutation.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  window.addEventListener('pageshow',schedule);
  window.addEventListener('ec:navigate',schedule);
  window.addEventListener('ec:region-change',schedule);
  window.addEventListener('ec:business-account-changed',schedule);
  window.addEventListener('ec:profile-image-updated',schedule);
  window.addEventListener('ec:network-restored',schedule);
  document.fonts?.ready?.then(schedule).catch(()=>{});
  setTimeout(schedule,250);
  setTimeout(schedule,800);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
