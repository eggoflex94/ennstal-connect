import { supabase } from './supabaseClient';

let timer=null;
let observer=null;
let profileData=null;

const OPERATOR_LABEL='Betreiber - Hauptadmin';

function relabel(root){
  if(!root||!profileData)return;
  const ownName=[...root.querySelectorAll('h1,h2,h3,strong,.profile-name,.integrated-profile-name')].some((n)=>String(n.textContent||'').trim().toLowerCase()===String(profileData.nickname||'').trim().toLowerCase());
  if(!ownName)return;
  root.querySelectorAll('.profile-role-badge,.integrated-profile-title span,.profile-function-card strong,.profile-function-card span,.profile-role-label,.member-role-label,span,strong,b').forEach((node)=>{
    const text=String(node.textContent||'').trim().toLowerCase();
    if(text==='head admin'||text==='hauptadmin'||text==='global admin'||text==='betreiber'||text==='betreiber - hauptadmin'||text==='betreiber – hauptadmin'||text==='global admin · betreiber'||text==='global admin - betreiber'){
      node.textContent=OPERATOR_LABEL;
      node.setAttribute('data-ec-operator-label','1');
    }
  });
}

function attachObserver(root){
  observer?.disconnect();
  if(!root)return;
  observer=new MutationObserver(()=>relabel(root));
  observer.observe(root,{childList:true,subtree:true,characterData:true});
}

async function apply(retries=10){
  if(!profileData){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const {data:profile}=await supabase.from('profiles').select('id,nickname,role,account_status').eq('id',user.id).maybeSingle();
    if(!profile||profile.role!=='HEAD_ADMIN'||profile.account_status!=='ACTIVE')return;
    profileData=profile;
  }
  const roots=[...document.querySelectorAll('.integrated-profile-view,.member-profile-page,.profile-page-layout,.profile-view')];
  const root=roots.find((node)=>[...node.querySelectorAll('h1,h2,h3,strong')].some((n)=>String(n.textContent||'').trim().toLowerCase()===String(profileData.nickname||'').trim().toLowerCase()));
  if(!root){if(retries>0)timer=setTimeout(()=>apply(retries-1),160);return;}
  relabel(root);
  attachObserver(root);
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void apply(),30);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:open-profile',schedule);
window.addEventListener('ec:profile-media-updated',schedule);
window.addEventListener('ec:profile-updated',schedule);
window.addEventListener('focus',schedule);
