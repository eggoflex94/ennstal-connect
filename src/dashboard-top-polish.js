import { supabase } from './supabaseClient';

const ADMIN_STAR='/role-star-red.svg';
const SUPPORTER_STAR='/supporter-star.svg';
const BUSINESS_STAR='/role-star-blue.svg';
let state={profile:null,regions:[],regionalAdmins:[],friends:[],adminAlerts:0};
let loading=false;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const role=p=>String(p?.role||'MEMBER').toUpperCase();
const activeRegion=()=>{
  const slug=document.documentElement.dataset.ecRegion||localStorage.getItem('ec-active-region')||'';
  return state.regions.find(r=>r.slug===slug)||state.regions.find(r=>r.id===state.profile?.home_region_id)||state.regions[0]||null;
};
const isRegionalAdmin=(p,regionId)=>state.regionalAdmins.some(a=>a.active&&a.user_id===p?.id&&a.region_id===regionId);
const starFor=(p,regionId)=>{
  if(['HEAD_ADMIN','ADMIN'].includes(role(p))||isRegionalAdmin(p,regionId))return ADMIN_STAR;
  if(role(p)==='SUPPORTER')return SUPPORTER_STAR;
  if(String(p?.account_badge||'').toUpperCase()==='BUSINESS')return BUSINESS_STAR;
  return '';
};

async function count(table,filter){
  try{let q=supabase.from(table).select('*',{count:'exact',head:true});if(filter)q=filter(q);const {count,error}=await q;return error?0:(count||0)}catch{return 0}
}

async function load(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const [{data:profile},{data:regions},{data:assignments},{data:friendships}]=await Promise.all([
      supabase.from('profiles').select('id,nickname,role,home_region_id,account_badge,account_status').eq('id',user.id).maybeSingle(),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
      supabase.from('friendships').select('requester_id,receiver_id,status').eq('status','ACCEPTED').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
    ]);
    state.profile=profile||null;state.regions=regions||[];state.regionalAdmins=assignments||[];
    const friendIds=(friendships||[]).map(f=>f.requester_id===user.id?f.receiver_id:f.requester_id).filter(Boolean);
    if(friendIds.length){
      const {data:friends}=await supabase.from('profiles').select('id,nickname,role,account_badge,avatar_url,is_online,hide_online_status,home_region_id,account_status').in('id',friendIds).eq('account_status','ACTIVE');
      state.friends=(friends||[]).filter(f=>f.is_online&&!f.hide_online_status);
    }else state.friends=[];

    if(['HEAD_ADMIN','ADMIN'].includes(role(profile))){
      const [reports,verifications,deletions,groupChanges]=await Promise.all([
        count('user_reports',q=>q.not('status','in','(RESOLVED,CLOSED,REJECTED,UNFOUNDED)')),
        count('verification_requests',q=>q.not('status','in','(APPROVED,REJECTED)')),
        count('account_deletion_requests',q=>q.in('status',['PENDING','ON_HOLD','READY_FOR_REVIEW'])),
        count('community_group_owner_change_requests',q=>q.eq('status','PENDING'))
      ]);
      state.adminAlerts=reports+verifications+deletions+groupChanges;
    }else state.adminAlerts=0;
    render();
  }catch(error){console.warn('Dashboard-Zusatzdaten konnten nicht geladen werden:',error)}
  finally{loading=false}
}

function roleScope(){
  const region=activeRegion(),p=state.profile,base=role(p);
  if(base==='HEAD_ADMIN')return{label:'GLOBAL ADMIN · BETREIBER',kind:'global'};
  if(base==='ADMIN')return{label:'GLOBAL ADMIN',kind:'global'};
  if(region&&isRegionalAdmin(p,region.id))return{label:`REGIONAL ADMIN · ${region.name}`,kind:'regional'};
  if(base==='SUPPORTER')return{label:'SUPPORTER',kind:'supporter'};
  return null;
}

function ensureRoleScope(dock){
  const head=dock.querySelector('.ec-dock-head');if(!head)return;
  let chip=head.querySelector('.ec-dashboard-role-scope');
  const scope=roleScope();
  if(!scope){chip?.remove();return;}
  if(!chip){chip=document.createElement('div');chip.className='ec-dashboard-role-scope';head.appendChild(chip)}
  chip.className=`ec-dashboard-role-scope is-${scope.kind}`;
  chip.textContent=scope.label;
}

function ensureAdminLabel(dock){
  const slot=dock.querySelector('.ec-dock-admin-slot');if(!slot)return;
  let label=dock.querySelector('.ec-admin-tools-label');
  const scope=roleScope();
  const show=['HEAD_ADMIN','ADMIN'].includes(role(state.profile));
  if(!show){label?.remove();return;}
  if(!label){label=document.createElement('div');label.className='ec-admin-tools-label';slot.before(label)}
  label.innerHTML=`<span>ADMIN TOOLS</span><small>${scope?.label||'Administration'}</small>`;
  slot.querySelectorAll('.ec-admin-icon-button').forEach(btn=>{
    const name=btn.getAttribute('aria-label')||btn.title||'Admin Tool';
    let visible=btn.querySelector('.ec-admin-visible-label');
    if(!visible){visible=document.createElement('span');visible.className='ec-admin-visible-label';btn.appendChild(visible)}
    visible.textContent=name;
  });
}

function ensureAdminBadge(dock){
  const button=dock.querySelector('.ec-admin-icon-button[data-ec-page="admin"]');
  if(!button)return;
  let badge=button.querySelector('.ec-admin-alert-badge');
  if(!state.adminAlerts){badge?.remove();return;}
  if(!badge){badge=document.createElement('em');badge.className='ec-admin-alert-badge';button.appendChild(badge)}
  badge.textContent=state.adminAlerts>99?'99+':String(state.adminAlerts);
  button.title=`Admin-Zentrale · ${state.adminAlerts} offene Aufgabe${state.adminAlerts===1?'':'n'}`;
}

function ensureOnlineFriends(dock){
  let panel=dock.querySelector('.ec-online-friends-panel');
  if(!panel){
    panel=document.createElement('section');panel.className='ec-online-friends-panel';
    const grid=dock.querySelector('.ec-compact-menu-grid');
    (grid||dock.querySelector('.ec-dock-head'))?.insertAdjacentElement('afterend',panel);
  }
  const region=activeRegion();
  const rows=state.friends.map(friend=>{
    const star=starFor(friend,region?.id||null);
    return `<button type="button" class="ec-online-friend" data-profile-id="${esc(friend.id)}" title="Profil von ${esc(friend.nickname||'Mitglied')} öffnen"><span class="ec-online-dot" aria-hidden="true"></span>${star?`<img src="${esc(star)}" alt="" aria-hidden="true">`:''}<strong>${esc(friend.nickname||'Mitglied')}</strong></button>`;
  }).join('');
  panel.innerHTML=`<div class="ec-online-friends-head"><span>FREUNDE ONLINE</span><em>${state.friends.length}</em></div><div class="ec-online-friends-list">${rows||'<small>Derzeit keine Freunde online.</small>'}</div>`;
  panel.querySelectorAll('[data-profile-id]').forEach(btn=>btn.onclick=()=>window.dispatchEvent(new CustomEvent('ec:open-profile',{detail:{profileId:btn.dataset.profileId}})));
}

function render(){
  const dock=document.querySelector('.ec-right-dock');if(!dock)return;
  dock.classList.add('ec-dashboard-top-integrated');
  ensureRoleScope(dock);ensureOnlineFriends(dock);ensureAdminLabel(dock);ensureAdminBadge(dock);
}

function boot(){
  render();void load();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecDashboardTopPolish);window.__ecDashboardTopPolish=setTimeout(render,70)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(()=>{render();void load()},80));
  window.addEventListener('focus',()=>void load());
  setInterval(()=>void load(),60000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
