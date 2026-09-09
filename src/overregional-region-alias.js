const LEGACY_SLUG='salzkammergut';
const NEW_SLUG='ueberregional';
const NEW_LABEL='Überregional';

function normalizePicker(){
  document.querySelectorAll('.ec-region-picker select').forEach(select=>{
    const legacy=[...select.options].find(option=>option.value===LEGACY_SLUG);
    const overregional=[...select.options].find(option=>option.value===NEW_SLUG);
    if(legacy&&overregional){
      if(select.value===LEGACY_SLUG)select.value=NEW_SLUG;
      legacy.remove();
      return;
    }
    if(legacy){
      legacy.textContent=NEW_LABEL;
      legacy.dataset.ecOverregionalAlias='1';
    }
  });
}

function normalizeVisibleLabels(){
  const active=document.documentElement.dataset.ecRegion;
  if(active!==LEGACY_SLUG)return;
  document.querySelectorAll('.ec-active-region-name,.ec-dock-home-region').forEach(el=>{el.textContent=NEW_LABEL});
  document.querySelectorAll('.ec-region-status strong,.ec-region-context strong').forEach(el=>{
    if((el.textContent||'').trim()==='Salzkammergut')el.textContent=NEW_LABEL;
  });
}

function normalize(){
  normalizePicker();
  normalizeVisibleLabels();
}

let queued=false;
function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;normalize()});
}

new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
window.addEventListener('ec:region-change',schedule);
window.addEventListener('focus',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
