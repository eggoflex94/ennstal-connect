const THEMES={
  supporter:{color:'#ffd400',bg:'linear-gradient(145deg,#ffe52b 0%,#d4a900 30%,#715500 55%,#251c00 78%,#070600 100%)',border:'#ffd400',shadow:'0 0 0 1px rgba(255,212,0,.5),0 0 26px rgba(255,212,0,.5),0 18px 34px rgba(0,0,0,.3)',row:'linear-gradient(105deg,#ffe52b 0%,#b98d00 40%,#2b2100 72%,#070600 100%)'},
  admin:{color:'#050505',bg:'linear-gradient(145deg,#ff2433 0%,#e10d20 32%,#a30716 58%,#57050d 78%,#180205 100%)',border:'#ff3947',shadow:'0 0 0 1px rgba(255,57,71,.42),0 0 24px rgba(255,31,49,.42),0 18px 34px rgba(0,0,0,.32)',row:'linear-gradient(105deg,#ff3443 0%,#c80b1c 42%,#43060c 76%,#160205 100%)'},
  business:{color:'#45c7ff',bg:'linear-gradient(145deg,#42caff 0%,#1399df 30%,#08699e 55%,#073a59 78%,#03141f 100%)',border:'#45c7ff',shadow:'0 0 0 1px rgba(69,199,255,.46),0 0 25px rgba(69,199,255,.42),0 18px 34px rgba(0,0,0,.3)',row:'linear-gradient(105deg,#43caff 0%,#0f85c5 42%,#073a59 76%,#03141f 100%)'},
  member:{color:'#eef2f6',bg:'linear-gradient(145deg,#dce2e8 0%,#aeb8c2 28%,#6f7b87 53%,#36434f 76%,#151d25 100%)',border:'#cbd3db',shadow:'0 0 0 1px rgba(220,226,232,.34),0 0 20px rgba(200,210,220,.25),0 18px 34px rgba(0,0,0,.28)',row:'linear-gradient(105deg,#dce2e8 0%,#7d8995 42%,#36434f 76%,#151d25 100%)'}
};
function setImportant(el,p,v){if(el.style.getPropertyValue(p)===v&&el.style.getPropertyPriority(p)==='important')return;el.style.setProperty(p,v,'important')}
function paint(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{const cls=`role-theme-${key}`;if(!el.classList.contains(cls))el.classList.add(cls);setImportant(el,'background',t.bg);setImportant(el,'border-color',t.border);setImportant(el,'box-shadow',t.shadow)})}
function paintRows(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{setImportant(el,'border',`1px solid ${t.border}`);setImportant(el,'background',t.row);setImportant(el,'box-shadow',`0 0 14px ${t.border}55`)})}
function paintNames(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(el=>{setImportant(el,'color',t.color);setImportant(el,'text-shadow',key==='admin'?'none':`0 0 12px ${t.color}44`)})}
function paintAvatar(selector,key){const t=THEMES[key];document.querySelectorAll(selector).forEach(card=>{const avatar=card.querySelector('.member-avatar');if(!avatar)return;setImportant(avatar,'border-color',t.border);setImportant(avatar,'box-shadow',`0 0 0 2px ${t.border}55,0 0 18px ${t.border}88`)})}
function formatMemberAges(){document.querySelectorAll('.member-card .member-name').forEach(target=>{if(target.dataset.ecAgeStacked==='1')return;const text=String(target.textContent||'').trim();const m=text.match(/^(.+?)\s*[·•-]\s*(\d{1,3})\s*Jahre$/i);if(!m)return;target.textContent='';const name=document.createElement('span');name.className='ec-member-realname';name.textContent=m[1].trim();const age=document.createElement('small');age.className='ec-member-age';age.textContent=`(${m[2]} Jahre)`;target.append(name,age);target.dataset.ecAgeStacked='1';setImportant(target,'display','flex');setImportant(target,'flex-direction','column');setImportant(target,'align-items','center');setImportant(target,'gap','3px');setImportant(target,'white-space','normal');setImportant(age,'font-size','.72em');setImportant(age,'font-weight','700');setImportant(age,'line-height','1.1');setImportant(age,'opacity','.92')})}
function paintRoles(){
 const member='.member-card.member:not(.business),.member-card.ec-role-member:not(.business),.member-card:has(.ec-pro-member):not(.business)';
 const business='.member-card.business,.member-card.ec-role-business,.member-card:has(.ec-pro-business)';
 const supporter='.member-card.supporter,.member-card.ec-role-supporter,.member-card:has(.ec-pro-supporter)';
 const admin='.member-card.admin,.member-card.head-admin,.member-card.ec-role-admin,.member-card.ec-role-head-admin,.member-card:has(.ec-pro-admin),.member-card:has(.ec-pro-head-admin)';
 paint(member,'member');paint(business,'business');paint(supporter,'supporter');paint(admin,'admin');
 paintAvatar(member,'member');paintAvatar(business,'business');paintAvatar(supporter,'supporter');paintAvatar(admin,'admin');
 paintNames('.member-card.supporter .ec-pro-nickname,.ec-role-supporter .ec-pro-nickname','supporter');
 paintNames('.member-card.admin .ec-pro-nickname,.member-card.head-admin .ec-pro-nickname,.ec-role-admin .ec-pro-nickname,.ec-role-head-admin .ec-pro-nickname','admin');
 paintNames('.member-card.business .ec-pro-nickname,.ec-role-business .ec-pro-nickname','business');
 paintNames('.member-card.member:not(.business) .ec-pro-nickname,.ec-role-member:not(.business) .ec-pro-nickname','member');
 paintRows('.ec-rf-person:has(.ec-pro-supporter),.ec-rf-update:has(.ec-pro-supporter),.ec-rf-activity:has(.ec-pro-supporter)','supporter');
 paintRows('.ec-rf-person:has(.ec-pro-admin),.ec-rf-person:has(.ec-pro-head-admin),.ec-rf-update:has(.ec-pro-admin),.ec-rf-update:has(.ec-pro-head-admin),.ec-rf-activity:has(.ec-pro-admin),.ec-rf-activity:has(.ec-pro-head-admin)','admin');
 paintRows('.ec-rf-person:has(.ec-pro-business),.ec-rf-update:has(.ec-pro-business),.ec-rf-activity:has(.ec-pro-business)','business');
 paintRows('.ec-rf-person:has(.ec-pro-member),.ec-rf-update:has(.ec-pro-member),.ec-rf-activity:has(.ec-pro-member)','member');
 formatMemberAges();
}
let scheduled=false;function schedulePaint(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paintRoles()})}
const start=()=>{paintRoles();const o=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||(r.type==='attributes'&&r.target?.classList?.contains('member-card'))))schedulePaint()});o.observe(document.body||document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();