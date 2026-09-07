import { supabase } from './supabaseClient';

const STAR_BY_THEME={admin:'/role-star-red.svg',supporter:'/supporter-star.svg',business:'/role-star-blue.svg'};
let state={userId:null,profile:null,regions:[],regionalAdmins:[]};
let busy=false;

const role=p=>String(p?.role||'MEMBER').toUpperCase();
const currentRegion=()=>{
  const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
  return state.regions.find(r=>r.slug===slug)||state.regions.find(r=>r.id===state.profile?.home_region_id)||state.regions[0]||null;
};
const themeFor=(p,regionId)=>{
  const base=role(p);
  if(base==='HEAD_ADMIN'||base==='ADMIN')return'admin';
  if(regionId&&state.regionalAdmins.some(a=>a.user_id===p?.id&&a.region_id===regionId&&a.active))return'admin';
  if(base==='SUPPORTER')return'supporter';
  if(String(p?.account_badge||'').toUpperCase()==='BUSINESS')return'business';
  return'member';
};

async function load(){
  if(busy||!supabase)return;
  busy=true;
  try{
    const {data:auth}=await supabase.auth.getUser();
    const uid=auth?.user?.id||null;
    if(!uid)return;
    const [{data:profile},{data:regions},{data:assignments}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_badge,home_region_id').eq('id',uid).maybeSingle(),
      supabase.from('regions').select('id,slug,name,is_active').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('user_id',uid).eq('active',true)
    ]);
    state={userId:uid,profile:profile||null,regions:regions||[],regionalAdmins:assignments||[]};
    apply();
  }catch(error){console.warn('Sidebar-Rollenanzeige konnte nicht gesetzt werden:',error)}
  finally{busy=false}
}

function apply(){
  const dock=document.querySelector('.ec-right-dock');
  const heading=dock?.querySelector('.ec-dock-head strong');
  const profile=state.profile;
  if(!dock||!heading||!profile)return;
  const region=currentRegion();
  const theme=themeFor(profile,region?.id||null);
  dock.dataset.ecSidebarRoleTheme=theme;
  heading.dataset.ecSidebarRoleTheme=theme;
  heading.dataset.ecNickname=profile.nickname||'Mitglied';
  heading.title='';

  const existing=[...heading.querySelectorAll('img.ec-sidebar-role-star,img.ec-global-role-star,img.ec-role-person-star')];
  existing.forEach(img=>img.remove());
  const label=heading.querySelector('span')||heading;
  if(label!==heading&&label.textContent!==(profile.nickname||'Mitglied'))label.textContent=profile.nickname||'Mitglied';
  if(label===heading&&heading.textContent!==(profile.nickname||'Mitglied'))heading.textContent=profile.nickname||'Mitglied';

  const star=STAR_BY_THEME[theme]||'';
  if(star)dock.style.setProperty('--ec-sidebar-role-star',`url("${star}")`);
  else dock.style.removeProperty('--ec-sidebar-role-star');
}

function boot(){
  void load();
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{apply();void load();},40));
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecSidebarRolePin);window.__ecSidebarRolePin=setTimeout(apply,60)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
