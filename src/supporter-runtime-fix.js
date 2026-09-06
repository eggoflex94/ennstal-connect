const SUPPORTER_BG='linear-gradient(145deg,#ffe522 0%,#bd9200 28%,#4a3a00 48%,#171300 65%,#050505 84%,#000 100%)';
const SUPPORTER_BORDER='#ffd400';
const SUPPORTER_SHADOW='0 0 0 1px rgba(255,212,0,.4),0 0 22px rgba(255,212,0,.42),0 18px 34px rgba(0,0,0,.3)';

function paintSupporters(){
  document.querySelectorAll('.member-card.ec-role-supporter,.member-card:has(.ec-pro-supporter),.member-card:has(img[alt="Supporter"])').forEach(card=>{
    card.classList.add('supporter');
    card.style.setProperty('background',SUPPORTER_BG,'important');
    card.style.setProperty('border-color',SUPPORTER_BORDER,'important');
    card.style.setProperty('box-shadow',SUPPORTER_SHADOW,'important');
  });
  document.querySelectorAll('.ec-rf-person:has(.ec-pro-supporter),.ec-rf-update:has(.ec-pro-supporter),.ec-rf-activity:has(.ec-pro-supporter)').forEach(row=>{
    row.classList.add('supporter-row');
    row.style.setProperty('border','1px solid #ffd400','important');
    row.style.setProperty('background','linear-gradient(105deg,rgba(255,218,0,.94) 0%,rgba(171,132,0,.82) 28%,rgba(45,37,2,.97) 58%,#050505 100%)','important');
    row.style.setProperty('box-shadow','0 0 14px rgba(255,212,0,.3)','important');
  });
}

const start=()=>{
  paintSupporters();
  const observer=new MutationObserver(()=>paintSupporters());
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  window.setInterval(paintSupporters,1200);
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
