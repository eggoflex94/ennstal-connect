const SUPPORTER_BG='linear-gradient(145deg,#ffe522 0%,#bd9200 28%,#4a3a00 48%,#171300 65%,#050505 84%,#000 100%)';
const SUPPORTER_BORDER='#ffd400';
const SUPPORTER_SHADOW='0 0 0 1px rgba(255,212,0,.4),0 0 22px rgba(255,212,0,.42),0 18px 34px rgba(0,0,0,.3)';
const SUPPORTER_ROW_BG='linear-gradient(105deg,rgba(255,218,0,.94) 0%,rgba(171,132,0,.82) 28%,rgba(45,37,2,.97) 58%,#050505 100%)';

function setImportant(el,prop,value){
  if(el.style.getPropertyValue(prop)===value && el.style.getPropertyPriority(prop)==='important')return;
  el.style.setProperty(prop,value,'important');
}

function paintSupporters(root=document){
  root.querySelectorAll?.('.member-card.ec-role-supporter,.member-card:has(.ec-pro-supporter),.member-card:has(img[alt="Supporter"])').forEach(card=>{
    if(!card.classList.contains('supporter'))card.classList.add('supporter');
    setImportant(card,'background',SUPPORTER_BG);
    setImportant(card,'border-color',SUPPORTER_BORDER);
    setImportant(card,'box-shadow',SUPPORTER_SHADOW);
  });
  root.querySelectorAll?.('.ec-rf-person:has(.ec-pro-supporter),.ec-rf-update:has(.ec-pro-supporter),.ec-rf-activity:has(.ec-pro-supporter)').forEach(row=>{
    if(!row.classList.contains('supporter-row'))row.classList.add('supporter-row');
    setImportant(row,'border','1px solid #ffd400');
    setImportant(row,'background',SUPPORTER_ROW_BG);
    setImportant(row,'box-shadow','0 0 14px rgba(255,212,0,.3)');
  });
}

let scheduled=false;
function schedulePaint(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    scheduled=false;
    paintSupporters();
  });
}

const start=()=>{
  paintSupporters();
  const observer=new MutationObserver(records=>{
    if(records.some(r=>r.addedNodes?.length))schedulePaint();
  });
  observer.observe(document.body||document.documentElement,{subtree:true,childList:true});
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
