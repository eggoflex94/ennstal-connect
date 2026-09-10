import { supabase } from './supabaseClient';

let timer=null;

function relabel(root){
  root.querySelectorAll('.profile-role-badge,.integrated-profile-title span,.profile-view span,.member-profile-page span').forEach((node)=>{
    const text=String(node.textContent||'').trim().toLowerCase();
    if(text==='head admin'||text==='hauptadmin'||text==='global admin'||text==='global admin · betreiber'||text==='global admin - betreiber'){
      node.textContent='Betreiber';
      node.setAttribute('data-ec-operator-label','1');
    }
  });
}

async function apply(retries=8){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from('profiles').select('id,nickname,role,account_status').eq('id',user.id).maybeSingle();
  if(!profile||profile.role!=='HEAD_ADMIN'||profile.account_status!=='ACTIVE')return;

  const roots=[...document.querySelectorAll('.integrated-profile-view,.member-profile-page,.profile-page-layout,.profile-view')];
  if(!roots.length){if(retries>0)timer=setTimeout(()=>apply(retries-1),160);return;}

  roots.forEach((root)=>{
    const ownName=[...root.querySelectorAll('h1,h2,h3,strong,.profile-name,.integrated-profile-name')].some((n)=>String(n.textContent||'').trim().toLowerCase()===String(profile.nickname||'').trim().toLowerCase());
    if(ownName)relabel(root);
  });
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void apply(),30);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:open-profile',schedule);
window.addEventListener('ec:profile-media-updated',schedule);
window.addEventListener('focus',schedule);
