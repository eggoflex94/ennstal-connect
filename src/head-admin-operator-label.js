import { supabase } from './supabaseClient';

let timer=null;

async function apply(retries=6){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data:profile}=await supabase.from('profiles').select('id,nickname,role,account_status').eq('id',user.id).maybeSingle();
  if(!profile||profile.role!=='HEAD_ADMIN'||profile.account_status!=='ACTIVE')return;

  const roots=[...document.querySelectorAll('.integrated-profile-view,.member-profile-page,.profile-page-layout,.profile-view')];
  if(!roots.length){if(retries>0)timer=setTimeout(()=>apply(retries-1),180);return;}

  roots.forEach(root=>{
    const name=[...root.querySelectorAll('h1,h2,h3,strong,.profile-name,.integrated-profile-name')].find(n=>String(n.textContent||'').trim().toLowerCase()===String(profile.nickname||'').trim().toLowerCase());
    if(!name)return;
    const candidates=[...root.querySelectorAll('span,small,strong,b,div')].filter(n=>{
      const t=String(n.textContent||'').trim().toLowerCase();
      return t==='hauptadmin'||t==='head admin'||t==='global admin · betreiber'||t==='global admin - betreiber';
    });
    candidates.forEach(n=>{n.textContent='Betreiber';n.setAttribute('data-ec-operator-label','1');});
  });
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>void apply(),40);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.addEventListener('ec:navigate',schedule);
window.addEventListener('ec:open-profile',schedule);
window.addEventListener('focus',schedule);
