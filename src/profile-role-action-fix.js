import { supabase } from './supabaseClient';

const ADMIN_STAR='/role-star-red.svg';
const SUPPORTER_STAR='/supporter-star.svg';
const BUSINESS_STAR='/role-star-blue.svg';
let cache={profiles:[],regions:[],assignments:[]};
let loading=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=p=>String(p?.role||'MEMBER').toUpperCase();
const regionName=id=>cache.regions.find(r=>r.id===id)?.name||'Region';
const assignmentsFor=id=>cache.assignments.filter(a=>a.user_id===id&&a.active);

function effectiveRole(member){
  const base=role(member);
  if(base==='HEAD_ADMIN')return{theme:'admin',star:ADMIN_STAR,label:'Global Admin · Betreiber'};
  if(base==='ADMIN')return{theme:'admin',star:ADMIN_STAR,label:'Global Admin'};
  const regional=assignmentsFor(member?.id);
  if(regional.length){
    const names=[...new Set(regional.map(a=>regionName(a.region_id)).filter(Boolean))];
    return{theme:'admin',star:ADMIN_STAR,label:`Regional Admin · ${names.join(' · ')}`};
  }
  if(base==='SUPPORTER')return{theme:'supporter',star:SUPPORTER_STAR,label:'Supporter'};
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return{theme:'business',star:BUSINESS_STAR,label:'Unternehmenskonto'};
  return{theme:'member',star:'',label:'Mitglied'};
}

function findMember(page){
  const id=page.dataset.profileId||page.dataset.targetId||page.querySelector('[data-profile-id]')?.dataset.profileId;
  if(id){const byId=cache.profiles.find(p=>p.id===id);if(byId)return byId}
  const nick=String(page.querySelector('.ec-clean-profile-main h1,.member-profile-hero h1')?.textContent||'').trim();
  return cache.profiles.find(p=>String(p.nickname||'').trim()===nick)||null;
}

function fixRoleBox(page,member){
  const box=page.querySelector('.ec-clean-profile-role');
  if(!box)return;
  const info=effectiveRole(member);
  box.classList.remove('role-admin','role-supporter','role-business','role-member');
  box.classList.add(`role-${info.theme}`);
  box.dataset.ecEffectiveRole=info.label;
  const strong=box.querySelector('strong');
  if(strong)strong.innerHTML=`${info.star?`<img src="${esc(info.star)}" alt="" aria-hidden="true">`:''}<span>${esc(info.label)}</span>`;
  const small=box.querySelector('small');
  if(small)small.textContent=`Heimatregion: ${regionName(member.home_region_id)}`;
}

function isProfileActionButton(button){
  const text=String(button.textContent||'').replace(/\s+/g,' ').trim();
  return /^(💬\s*)?Nachricht$|Befreundet|Freundschaft|Blockieren|Nutzer melden/i.test(text);
}

function hideDuplicateActionBars(page){
  const canonical=page.querySelector('.ec-clean-profile .ec-clean-profile-actions');
  const candidates=[...page.querySelectorAll('button,a')].filter(el=>!canonical?.contains(el)&&isProfileActionButton(el));
  const parents=new Set();
  for(const button of candidates){
    let node=button.parentElement;
    while(node&&node!==page){
      const matches=[...node.querySelectorAll(':scope > button,:scope > a')].filter(isProfileActionButton);
      if(matches.length>=2){parents.add(node);break}
      node=node.parentElement;
    }
  }
  parents.forEach(node=>node.classList.add('ec-profile-duplicate-actions-hidden'));
  page.querySelectorAll(':scope > .member-profile-actions,.member-profile-actions.ec-clean-profile-hidden').forEach(node=>node.classList.add('ec-profile-duplicate-actions-hidden'));
}

function apply(){
  document.querySelectorAll('.member-profile-page').forEach(page=>{
    const member=findMember(page);
    if(member)fixRoleBox(page,member);
    hideDuplicateActionBars(page);
  });
}

async function load(force=false){
  if(loading||(!force&&cache.profiles.length))return;
  loading=true;
  try{
    const [{data:profiles},{data:regions},{data:assignments}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge,home_region_id,account_status').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,name').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    cache={profiles:profiles||[],regions:regions||[],assignments:assignments||[]};
    apply();
  }catch(error){console.warn('Profilrolle konnte nicht final dargestellt werden:',error)}finally{loading=false}
}

function boot(){
  void load(true);
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecProfileRoleActionFix);window.__ecProfileRoleActionFix=setTimeout(apply,70)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{apply();void load(true)},80));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
