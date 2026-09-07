const mobile=window.matchMedia('(max-width: 900px)');
const lastNativeClick=new WeakMap();
let pointerStart=null;
const interactiveSelector='button,a[href],[role="button"],summary,label,select,input[type="checkbox"],input[type="radio"],input[type="file"]';

function actionable(target){
  const el=target instanceof Element?target.closest(interactiveSelector):null;
  if(!el||el.matches(':disabled,[aria-disabled="true"]'))return null;
  if(el.closest('.ec-global-news-overlay,.ec-popup-admin-editor,.ec-global-news-editor,.ec-clean-admin-modal,.ec-admin-workspace,.content-editor-overlay,.profile-modal'))return el;
  if(el.closest('[hidden],[aria-hidden="true"]'))return null;
  return el;
}

function repairHitTesting(){
  if(!mobile.matches)return;
  const dock=document.querySelector('.ec-right-dock');
  if(dock&&!document.body.classList.contains('ec-dock-open')){
    dock.style.pointerEvents='none';dock.style.visibility='hidden';
  }else if(dock){dock.style.removeProperty('pointer-events');dock.style.removeProperty('visibility')}
  document.querySelectorAll('.ec-admin-workspace[hidden],.content-editor-overlay[hidden],.ec-clean-admin-modal[hidden],.profile-modal[hidden]').forEach(el=>{el.style.pointerEvents='none';el.style.display='none'});
}

document.addEventListener('click',e=>{
  if(!mobile.matches)return;
  const el=actionable(e.target);if(el)lastNativeClick.set(el,performance.now());
},true);

document.addEventListener('pointerdown',e=>{
  if(!mobile.matches||e.pointerType==='mouse')return;
  repairHitTesting();
  const el=actionable(e.target);if(!el)return;
  pointerStart={el,x:e.clientX,y:e.clientY,t:performance.now(),pointerId:e.pointerId};
},{capture:true,passive:true});

document.addEventListener('pointerup',e=>{
  if(!mobile.matches||e.pointerType==='mouse'||!pointerStart||pointerStart.pointerId!==e.pointerId)return;
  const start=pointerStart;pointerStart=null;
  if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>12||performance.now()-start.t>900)return;
  const el=start.el;
  setTimeout(()=>{
    if(!document.contains(el)||el.matches(':disabled,[aria-disabled="true"]'))return;
    const nativeAt=lastNativeClick.get(el)||0;
    if(nativeAt>=start.t)return;
    if(el.matches('select,input[type="file"]')){el.focus({preventScroll:true});try{el.showPicker?.()}catch{}return}
    el.click();
  },90);
},{capture:true,passive:true});

document.addEventListener('pointercancel',()=>{pointerStart=null},{capture:true,passive:true});
window.addEventListener('resize',repairHitTesting,{passive:true});
window.addEventListener('orientationchange',()=>setTimeout(repairHitTesting,120),{passive:true});
window.addEventListener('ec:region-change',()=>setTimeout(repairHitTesting,80));
new MutationObserver(()=>{clearTimeout(window.__ecMobileTapRepair);window.__ecMobileTapRepair=setTimeout(repairHitTesting,50)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-hidden']});
repairHitTesting();