import { supabase } from './supabaseClient';

let viewer=null;
let members=[];
let regions=[];
let assignments=[];
let loading=false;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const memberForCard=card=>{
  const name=norm(card.querySelector('.admin-member-person-button strong')?.textContent);
  return members.find(m=>norm(m.nickname)===name)||null;
};
const assignedRegions=id=>assignments.filter(a=>a.user_id===id&&a.active).map(a=>a.region_id);
const regionName=id=>regions.find(r=>r.id===id)?.name||'Region';

async function refresh(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const [{data:v},{data:ms},{data:rs},{data:as}]=await Promise.all([
      supabase.from('profiles').select('id,role,account_status').eq('id',user.id).maybeSingle(),
      supabase.from('profiles').select('id,nickname,role,account_status').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true)
    ]);
    viewer=v||null;members=ms||[];regions=rs||[];assignments=as||[];
    decorate();
  }catch(error){console.warn('Rollenverwaltung konnte nicht geladen werden:',error)}
  finally{loading=false}
}

async function setBaseRole(member,role,status){
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:role});
  if(error)throw error;
  status.textContent='Rolle gespeichert.';
}

async function setRegional(member,regionSlug,enabled,status){
  if(!regionSlug)throw new Error('Bitte Region wählen.');
  if(enabled&&String(member.role||'MEMBER').toUpperCase()==='MEMBER'){
    const {error:baseError}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:'SUPPORTER'});
    if(baseError)throw baseError;
  }
  const {error}=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:regionSlug,p_enabled:enabled});
  if(error)throw error;
  status.textContent=enabled?'Regionaladmin vergeben.':'Regionaladmin entfernt.';
}

function buildManager(card,member){
  if(card.querySelector(':scope > .ec-role-manager'))return;
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN'||String(member.role||'').toUpperCase()==='HEAD_ADMIN')return;

  const wrap=document.createElement('section');
  wrap.className='ec-role-manager';
  const assigned=assignedRegions(member.id);
  wrap.innerHTML=`<div class="ec-role-manager-head"><strong>Rollen verwalten</strong><small>Basisrolle und regionale Adminrolle getrennt steuern</small></div>
    <div class="ec-role-manager-grid">
      <label><span>Basisrolle</span><select class="ec-base-role"><option value="MEMBER">Mitglied</option><option value="SUPPORTER">Supporter</option><option value="ADMIN">Community Admin</option></select></label>
      <label><span>Region</span><select class="ec-region-role"><option value="">Region wählen</option>${regions.map(r=>`<option value="${r.slug}">${r.name}</option>`).join('')}</select></label>
    </div>
    <div class="ec-role-manager-actions"><button type="button" data-action="base">Basisrolle speichern</button><button type="button" data-action="regional-on">Regional Admin vergeben</button><button type="button" data-action="regional-off">Regional Admin entfernen</button></div>
    <div class="ec-role-manager-current">${assigned.length?`Regional Admin: ${assigned.map(regionName).join(', ')}`:'Keine regionale Adminrolle'}</div><p class="ec-role-manager-status" aria-live="polite"></p>`;

  const base=wrap.querySelector('.ec-base-role');
  base.value=['MEMBER','SUPPORTER','ADMIN'].includes(String(member.role||'').toUpperCase())?String(member.role).toUpperCase():'MEMBER';
  const status=wrap.querySelector('.ec-role-manager-status');
  wrap.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;status.textContent='Wird gespeichert …';status.className='ec-role-manager-status';
    try{
      const action=button.dataset.action;
      if(action==='base')await setBaseRole(member,base.value,status);
      else await setRegional(member,wrap.querySelector('.ec-region-role').value,action==='regional-on',status);
      status.classList.add('ok');
      await refresh();
    }catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.';status.classList.add('bad')}
    finally{button.disabled=false}
  });
  card.appendChild(wrap);
}

function decorate(){
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN')return;
  document.querySelectorAll('.admin-member-card').forEach(card=>{const member=memberForCard(card);if(member)buildManager(card,member)});
}

function boot(){
  void refresh();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecAdminRoleManager);window.__ecAdminRoleManager=setTimeout(decorate,80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(refresh,60));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
