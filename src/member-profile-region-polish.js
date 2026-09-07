import { supabase } from './supabaseClient';

let profiles=[];
let regions=[];
let assignments=[];
let loading=false;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const regionNow=()=>{
  const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
  return regions.find(r=>r.slug===slug)||regions[0]||null;
};
const assignmentsFor=id=>assignments.filter(a=>a.user_id===id&&a.active);

function effective(member,region){
  const base=String(member?.role||'MEMBER').toUpperCase();
  if(base==='HEAD_ADMIN')return{label:'Hauptadmin',theme:'admin'};
  if(base==='ADMIN')return{label:'Community Admin',theme:'admin'};
  if(region&&assignmentsFor(member?.id).some(a=>a.region_id===region.id))return{label:`Regional Admin · ${region.name}`,theme:'admin'};
  if(base==='SUPPORTER')return{label:'Supporter',theme:'supporter'};
  if(String(member?.account_badge||'').toUpperCase()==='BUSINESS')return{label:'Unternehmenskonto',theme:'business'};
  return{label:'Mitglied',theme:'member'};
}

function findMember(page){
  const id=page?.dataset?.profileId;
  if(id)return profiles.find(p=>p.id===id)||null;
  const name=norm(page?.querySelector('.member-profile-hero h1')?.textContent);
  return profiles.find(p=>norm(p.nickname)===name)||null;
}

function polish(){
  const page=document.querySelector('.member-profile-page');
  if(!page||!profiles.length)return;
  const member=findMember(page);
  if(!member)return;
  const region=regionNow();
  const info=effective(member,region);
  page.dataset.ecEffectiveTheme=info.theme;
  const hero=page.querySelector('.member-profile-hero');
  if(!hero)return;
  hero.dataset.ecEffectiveTheme=info.theme;
  const label=hero.querySelector(':scope > div > span');
  if(label)label.textContent=info.label;
}

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const [{data:ps},{data:rs},{data:as}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    profiles=ps||[];regions=rs||[];assignments=as||[];
    polish();
  }catch(error){console.warn('Profilrolle konnte nicht regional dargestellt werden:',error)}
  finally{loading=false}
}

function boot(){
  void load();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecMemberProfileRegionPolish);window.__ecMemberProfileRegionPolish=setTimeout(polish,60)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{polish();void load();},40));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
