import { supabase } from './supabaseClient';

let state={globalAdmin:false,regionalAdmin:false,forum:false,moderation:false,announcements:false,loaded:false};
let loading=false;

const activeRegionSlug=()=>document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
const clean=(value)=>String(value||'').replace(/\s+/g,' ').trim();

function allowedFor(label){
  const l=clean(label).toLowerCase();
  if(!state.loaded)return false;
  if(/kontoschutz|verifiz/.test(l))return state.globalAdmin;
  if(/admin-forum|forum/.test(l))return state.globalAdmin||state.forum||state.moderation;
  if(/meldungen/.test(l))return state.globalAdmin||state.moderation;
  if(/mitglieder/.test(l))return state.globalAdmin||state.regionalAdmin||state.moderation;
  if(/community|neuigkeiten/.test(l))return state.globalAdmin||state.regionalAdmin||state.announcements;
  return state.globalAdmin;
}

function apply(){
  document.querySelectorAll('.admin-dashboard-shortcuts').forEach(panel=>{
    panel.classList.add('ec-admin-central-modern');
    panel.querySelector('.admin-dashboard-heading')?.classList.add('ec-admin-central-head');
    const actions=panel.querySelector('.admin-dashboard-actions');
    actions?.classList.add('ec-admin-central-grid');
    const buttons=[...panel.querySelectorAll('.admin-dashboard-action,button')].filter(button=>button.closest('.admin-dashboard-actions')===actions);
    let visible=0;
    buttons.forEach(button=>{
      const label=clean(button.textContent);
      const show=allowedFor(label);
      button.hidden=!show;
      button.style.setProperty('display',show?'grid':'none','important');
      button.toggleAttribute('aria-hidden',!show);
      button.disabled=!show;
      if(show)visible+=1;
    });
    let empty=panel.querySelector('.ec-admin-central-empty');
    if(!visible&&state.loaded){
      if(!empty){empty=document.createElement('p');empty.className='ec-admin-central-empty';actions?.after(empty)}
      empty.textContent='Für dein Konto sind in dieser Region derzeit keine zusätzlichen Verwaltungsbereiche freigeschaltet.';
      empty.hidden=false;
    }else if(empty){empty.hidden=true}
    const intro=panel.querySelector('.admin-dashboard-heading p');
    if(intro)intro.textContent='Es werden nur Verwaltungsbereiche angezeigt, für die dein Konto in dieser Region berechtigt ist.';
  });
}

async function loadRights(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){state={...state,loaded:true};apply();return}
    const [{data:profile},{data:regions},{data:assignments},{data:mods}]=await Promise.all([
      supabase.from('profiles').select('role,forum_moderator').eq('id',user.id).maybeSingle(),
      supabase.from('regions').select('id,slug').eq('is_active',true),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true)
    ]);
    const role=String(profile?.role||'').toUpperCase();
    const globalAdmin=['HEAD_ADMIN','ADMIN'].includes(role);
    const active=(regions||[]).find(region=>region.slug===activeRegionSlug())||null;
    const regionalAdmin=!!active&&(assignments||[]).some(item=>item.active&&item.region_id===active.id);
    const relevant=(mods||[]).filter(item=>item.active&&(!active||item.region_id===active.id));
    const permissions=new Set(relevant.flatMap(item=>Array.isArray(item.permissions)?item.permissions.map(value=>String(value).toUpperCase()):[]));
    state={
      globalAdmin,
      regionalAdmin,
      forum:globalAdmin||!!profile?.forum_moderator||permissions.has('FORUM'),
      moderation:globalAdmin||permissions.has('MODERATION')||permissions.has('REPORTS'),
      announcements:globalAdmin||permissions.has('ANNOUNCEMENTS'),
      loaded:true
    };
    apply();
  }catch(error){
    console.warn('Admin-Zentrale Rechte konnten nicht geladen werden:',error);
    state={...state,loaded:true};
    apply();
  }finally{loading=false}
}

function boot(){
  void loadRights();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecAdminCentralPermissions);window.__ecAdminCentralPermissions=setTimeout(apply,70)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>void loadRights(),80));
  window.addEventListener('ec:navigate',()=>setTimeout(apply,80));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
