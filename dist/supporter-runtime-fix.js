const THEMES={
  supporter:{color:'#ffd400',bg:'linear-gradient(145deg,#ffe522 0%,#bd9200 28%,#4a3a00 48%,#171300 65%,#050505 84%,#000 100%)',border:'#ffd400',shadow:'0 0 0 1px rgba(255,212,0,.4),0 0 22px rgba(255,212,0,.42),0 18px 34px rgba(0,0,0,.3)',row:'linear-gradient(105deg,rgba(255,218,0,.94) 0%,rgba(171,132,0,.82) 28%,rgba(45,37,2,.97) 58%,#050505 100%)'},
  admin:{color:'#ef4444',bg:'linear-gradient(145deg,#ff3b46 0%,#c91828 34%,#68111b 62%,#160609 100%)',border:'#ff4652',shadow:'0 0 0 1px rgba(255,70,82,.35),0 0 22px rgba(255,40,55,.32),0 18px 34px rgba(0,0,0,.3)',row:'linear-gradient(105deg,rgba(239,68,68,.94) 0%,rgba(145,20,32,.86) 38%,#170609 100%)'},
  business:{color:'#45c7ff',bg:'linear-gradient(145deg,#22b9ff 0%,#087bb8 35%,#06476d 62%,#04131d 100%)',border:'#45c7ff',shadow:'0 0 0 1px rgba(69,199,255,.38),0 0 22px rgba(69,199,255,.34),0 18px 34px rgba(0,0,0,.3)',row:'linear-gradient(105deg,rgba(69,199,255,.94) 0%,rgba(10,105,157,.86) 38%,#04131d 100%)'},
  member:{color:'#e5e7eb',bg:'linear-gradient(145deg,#cfd4da 0%,#9aa3ad 26%,#56616d 50%,#26323d 72%,#111820 100%)',border:'#b9c0c8',shadow:'0 0 0 1px rgba(207,212,218,.28),0 0 18px rgba(190,198,207,.20),0 18px 34px rgba(0,0,0,.28)',row:'linear-gradient(105deg,rgba(207,212,218,.90) 0%,rgba(113,124,136,.82) 38%,#18222c 100%)'}
};
function setImportant(el,p,v){if(el.style.getPropertyValue(p)===v&&el.style.getPropertyPriority(p)==='important')return;el.style.setProperty(p,v,'important')}
function paint(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{el.classList.add(`role-theme-${key}`);setImportant(el,'background',t.bg);setImportant(el,'border-color',t.border);setImportant(el,'box-shadow',t.shadow)})}
function paintRows(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{setImportant(el,'border',`1px solid ${t.border}`);setImportant(el,'background',t.row);setImportant(el,'box-shadow',`0 0 14px ${t.border}55`)})}
function paintNames(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{setImportant(el,'color',t.color);setImportant(el,'text-shadow',`0 0 12px ${t.color}44`)})}
function formatMemberAges(){
  document.querySelectorAll('.member-card').forEach(card=>{
    if(card.dataset.ecAgeStacked==='1')return;
    const nodes=[...card.querySelectorAll('.member-name,strong,p,div,span')].filter(el=>!el.children.length);
    const target=nodes.find(el=>/^\s*.+?\s*[·•-]\s*\d{1,3}\s*Jahre\s*$/i.test(el.textContent||''));
    if(!target)return;
    const m=String(target.textContent||'').trim().match(/^(.+?)\s*[·•-]\s*(\d{1,3})\s*Jahre$/i);
    if(!m)return;
    target.textContent='';
    const name=document.createElement('span');name.className='ec-member-realname';name.textContent=m[1].trim();
    const age=document.createElement('small');age.className='ec-member-age';age.textContent=`(${m[2]} Jahre)`;
    target.append(name,age);
    target.style.setProperty('display','flex','important');
    target.style.setProperty('flex-direction','column','important');
    target.style.setProperty('align-items','center','important');
    target.style.setProperty('gap','3px','important');
    name.style.setProperty('display','block','important');
    age.style.setProperty('display','block','important');
    age.style.setProperty('font-size','0.72em','important');
    age.style.setProperty('font-weight','700','important');
    age.style.setProperty('line-height','1.1','important');
    age.style.setProperty('opacity','.9','important');
    card.dataset.ecAgeStacked='1';
  });
}
function paintRoles(){
  paint('.member-card.ec-role-supporter,.member-card:has(.ec-pro-supporter),.member-card:has(img[alt="Supporter"])','supporter');
  paint('.member-card.ec-role-admin,.member-card.ec-role-head-admin,.member-card:has(.ec-pro-admin),.member-card:has(.ec-pro-head-admin),.member-card:has(img[alt="Admin"]),.member-card:has(img[alt="Hauptadmin"])','admin');
  paint('.member-card.ec-role-business,.member-card:has(.ec-pro-business),.member-card:has(img[alt="Unternehmenskonto"])','business');
  paint('.member-card.ec-role-member,.member-card:has(.ec-pro-member),.member-card:has(img[alt="Mitglied"])','member');
  paintRows('.ec-rf-person:has(.ec-pro-supporter),.ec-rf-update:has(.ec-pro-supporter),.ec-rf-activity:has(.ec-pro-supporter)','supporter');
  paintRows('.ec-rf-person:has(.ec-pro-admin),.ec-rf-person:has(.ec-pro-head-admin),.ec-rf-update:has(.ec-pro-admin),.ec-rf-update:has(.ec-pro-head-admin),.ec-rf-activity:has(.ec-pro-admin),.ec-rf-activity:has(.ec-pro-head-admin)','admin');
  paintRows('.ec-rf-person:has(.ec-pro-business),.ec-rf-update:has(.ec-pro-business),.ec-rf-activity:has(.ec-pro-business)','business');
  paintRows('.ec-rf-person:has(.ec-pro-member),.ec-rf-update:has(.ec-pro-member),.ec-rf-activity:has(.ec-pro-member)','member');
  paintNames('.ec-pro-supporter .ec-pro-nickname,.ec-role-supporter .ec-pro-nickname','supporter');
  paintNames('.ec-pro-admin .ec-pro-nickname,.ec-pro-head-admin .ec-pro-nickname,.ec-role-admin .ec-pro-nickname,.ec-role-head-admin .ec-pro-nickname','admin');
  paintNames('.ec-pro-business .ec-pro-nickname,.ec-role-business .ec-pro-nickname','business');
  paintNames('.ec-pro-member .ec-pro-nickname,.ec-role-member .ec-pro-nickname','member');
  formatMemberAges();
}
let scheduled=false;function schedulePaint(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paintRoles()})}
const start=()=>{paintRoles();const o=new MutationObserver(r=>{if(r.some(x=>x.addedNodes?.length))schedulePaint()});o.observe(document.body||document.documentElement,{subtree:true,childList:true})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
