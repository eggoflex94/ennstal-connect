import { supabase } from './supabaseClient';

let timer=null;
let observer=null;
let profileData=null;

const OPERATOR_LABEL='Betreiber (Hauptadmin)';

function ownProfileRoots(){
  if(!profileData)return[];
  const nickname=String(profileData.nickname||'').trim().toLowerCase();
  return [...document.querySelectorAll('.integrated-profile-view,.member-profile-page,.profile-page-layout,.profile-view,.ec-clean-profile')].filter((root)=>
    [...root.querySelectorAll('h1,h2,h3,strong,.profile-name,.integrated-profile-name')]
      .some((node)=>String(node.textContent||'').trim().toLowerCase()===nickname)
  );
}

function isLegacyHeadAdminLabel(text){
  return [
    'head admin','hauptadmin','global admin','betreiber','betreiber - hauptadmin',
    'betreiber – hauptadmin','betreiber (hauptadmin)','global admin · betreiber',
    'global admin - betreiber','hauptadmin · betreiber'
  ].includes(String(text||'').trim().toLowerCase());
}

function relabel(root){
  if(!root||!profileData)return;
  root.querySelectorAll('.ec-clean-profile-role strong,.profile-role-badge,.integrated-profile-title span,.profile-function-card strong,.profile-function-card span,.profile-role-label,.member-role-label,span,strong,b').forEach((node)=>{
    if(!isLegacyHeadAdminLabel(node.textContent))return;
    node.textContent=OPERATOR_LABEL;
    node.setAttribute('data-ec-operator-label','1');
  });
}

function relabelAll(){
  ownProfileRoots().forEach(relabel);
}

function attachObserver(){
  observer?.disconnect();
  observer=new MutationObserver(()=>relabelAll());
  observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
}

async function apply(retries=10){
  if(!profileData){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data:profile}=await supabase.from('profiles').select('id,nickname,role,account_status').eq('id',user.id).maybeSingle();
    if(!profile||profile.role!=='HEAD_ADMIN'||profile.account_status!=='ACTIVE')return;
    profileData=profile;
  }

  const roots=ownProfileRoots();
  if(!roots.length){
    if(retries>0)timer=setTimeout(()=>apply(retries-1),160);
    return;
  }

  relabelAll();
  attachObserver();
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void apply(),30);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:open-profile',schedule);
window.addEventListener('ec:profile-media-updated',schedule);
window.addEventListener('ec:profile-updated',schedule);
window.addEventListener('focus',schedule);
