import { supabase } from './supabaseClient';

let viewer=null, regions=[];
const roleLabel=(role)=>({HEAD_ADMIN:'Hauptadmin',ADMIN:'Global Admin',SUPPORTER:'Supporter',MEMBER:'Mitglied'}[String(role||'MEMBER').toUpperCase()]||'Mitglied');
async function context(){
  const {data:{user}}=await supabase.auth.getUser(); if(!user)return;
  const [{data:p},{data:r}]=await Promise.all([supabase.from('profiles').select('id,nickname,role,home_region_id').eq('id',user.id).maybeSingle(),supabase.from('regions').select('id,name').eq('is_active',true)]);
  viewer=p||null; regions=r||[];
}
function dockIdentity(){
  const dock=document.querySelector('.ec-right-dock'); if(!dock||!viewer)return;
  let el=dock.querySelector('.ec-dock-identity'); if(!el){el=document.createElement('div');el.className='ec-dock-identity';(dock.querySelector('.ec-dock-head')||dock.firstElementChild)?.after(el)}
  const role=String(viewer.role||'MEMBER').toUpperCase(); const region=regions.find(r=>r.id===viewer.home_region_id)?.name||'Keine Region';
  el.innerHTML=`<span class="ec-dock-role-star" aria-hidden="true">${['HEAD_ADMIN','ADMIN'].includes(role)?'★':'☆'}</span><div><strong>${viewer.nickname||'Mitglied'}</strong><small>${roleLabel(role)} · ${region}</small></div>`;
}
function lock(){
  document.querySelector('.member-grid')?.classList.add('ec-final-member-grid');
  document.querySelectorAll('.ec-stable-profile-page').forEach(root=>{root.classList.add('ec-profile-layout-locked');root.querySelector('.ec-stable-profile-card')?.classList.add('ec-profile-card-locked')});
  dockIdentity();
}
async function run(){if(!viewer)await context();lock()}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run()})}).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('DOMContentLoaded',run);window.addEventListener('ec:region-change',()=>setTimeout(run,40));run();
