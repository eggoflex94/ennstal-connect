/* Mobile profile editor interaction authority.
   Ensures text fields, selects and uploads remain directly focusable on coarse pointers. */
const coarse = window.matchMedia('(pointer: coarse)');
const selector = '.profile-form input, .profile-form textarea, .profile-form select, .profile-form button, .my-area-layout form input, .my-area-layout form textarea, .my-area-layout form select, .my-area-layout form button';

function isEditorControl(target){
  return target instanceof Element ? target.closest(selector) : null;
}

function repairProfileEditor(){
  if(!coarse.matches)return;
  document.querySelectorAll('.profile-form, .my-area-layout form').forEach(form=>{
    form.style.pointerEvents='auto';
    form.style.position='relative';
    form.style.zIndex='20';
  });
  document.querySelectorAll(selector).forEach(el=>{
    el.style.pointerEvents='auto';
    el.style.touchAction='auto';
    el.style.position='relative';
    el.style.zIndex='21';
  });
}

function focusNativeControl(el){
  if(!el || el.matches(':disabled,[aria-disabled="true"]'))return;
  if(el.matches('input[type="file"],select')){
    el.focus({preventScroll:true});
    try{el.showPicker?.()}catch{}
    return;
  }
  if(el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),textarea')){
    el.focus({preventScroll:true});
    return;
  }
}

document.addEventListener('pointerdown',event=>{
  if(!coarse.matches || event.pointerType==='mouse')return;
  const el=isEditorControl(event.target);
  if(!el)return;
  repairProfileEditor();
  focusNativeControl(el);
},{capture:true,passive:true});

document.addEventListener('touchend',event=>{
  if(!coarse.matches)return;
  const el=isEditorControl(event.target);
  if(!el)return;
  if(el.matches('input,textarea,select'))setTimeout(()=>focusNativeControl(el),0);
},{capture:true,passive:true});

window.addEventListener('orientationchange',()=>setTimeout(repairProfileEditor,100),{passive:true});
window.addEventListener('resize',repairProfileEditor,{passive:true});
new MutationObserver(()=>{
  clearTimeout(window.__ecProfileEditorRepair);
  window.__ecProfileEditorRepair=setTimeout(repairProfileEditor,40);
}).observe(document.documentElement,{childList:true,subtree:true});

repairProfileEditor();
