import { supabase } from './supabaseClient';

let viewer=null;
let members=[];
let regions=[];
let assignments=[];
let moderation=[];
let loading=false;

const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
const memberForCard=card=>{
  const name=norm(card.querySelector('.admin-member-person-button strong')?.textContent);
  return members.find(m=>norm(m.nickname)===name)||null;
};
const assignedRegions=id=>assignments.filter(a=>a.user_id===id&&a.active).map(a=>a.region_id);
const moderationFor=id=>moderation.filter(a=>a.user_id===id&&a.active);
const regionName=id=>regions.find(r=>r.id===id)?.name||'Region';
const permissionLabel=p=>String(p).toUpperCase()==='GROUPS'?'Gruppen':String(p).toUpperCase()==='FORUM'?'Forum':String(p);

async function refresh(){
  if(loading||!supabase)return;
  loading=true;
  try{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return;
    const [{data:v},{data:ms},{data:rs},{data:as},{data:mods}]=await Promise.all([
      supabase.from('profiles').select('id,role,account_status').eq('id',user.id).maybeSingle(),
      supabase.from('profiles').select('id,nickname,role,account_status').eq('account_status','ACTIVE'),
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active',true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('active',true)
    ]);
    viewer=v||null;members=ms||[];regions=rs||[];assignments=as||[];moderation=mods||[];
    decorate(true);
  }catch(error){console.warn('Rollenverwaltung konnte nicht geladen werden:',error)}
  finally{loading=false}
}

async function ensureSupporter(member){
  if(String(member.role||'MEMBER').toUpperCase()!=='MEMBER')return;
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:'SUPPORTER'});
  if(error)throw error;
}

async function setBaseRole(member,role,status){
  const {error}=await supabase.rpc('admin_set_role',{target_user:member.id,new_role:role});
  if(error)throw error;
  status.textContent='Basisrolle gespeichert.';
}

async function setRegional(member,regionSlug,enabled,status){
  if(!regionSlug)throw new Error('Bitte Region wählen.');
  if(enabled)await ensureSupporter(member);
  const {error}=await supabase.rpc('ec_set_regional_admin',{p_target:member.id,p_region_slug:regionSlug,p_enabled:enabled});
  if(error)throw error;
  status.textContent=enabled?'Regionaladmin vergeben.':'Regionaladmin entfernt.';
}

async function setModeration(member,regionSlugs,permissions,enabled,status){
  if(!permissions.length)throw new Error('Bitte Forum und/oder Gruppen auswählen.');
  if(enabled)await ensureSupporter(member);
  for(const slug of regionSlugs){
    const {error}=await supabase.rpc('ec_set_regional_moderator',{p_target:member.id,p_region_slug:slug,p_permissions:permissions,p_enabled:enabled});
    if(error)throw error;
  }
  status.textContent=enabled?'Moderationsrechte gespeichert.':'Moderationsrechte entfernt.';
}

function currentModerationText(member){
  const rows=moderationFor(member.id);
  if(!rows.length)return'Keine Moderationsrechte';
  const allRegionIds=new Set(regions.map(r=>r.id));
  const moderatedIds=new Set(rows.map(r=>r.region_id));
  const samePermissions=rows.length>0&&rows.every(r=>JSON.stringify([...(r.permissions||[])].sort())===JSON.stringify([...(rows[0].permissions||[])].sort()));
  if(allRegionIds.size&&moderatedIds.size===allRegionIds.size&&[...allRegionIds].every(id=>moderatedIds.has(id))&&samePermissions){
    return `Global: ${(rows[0].permissions||[]).map(permissionLabel).join(' + ')||'Moderation'}`;
  }
  return rows.map(row=>`${regionName(row.region_id)}: ${(row.permissions||[]).map(permissionLabel).join(' + ')||'Moderation'}`).join(' · ');
}

function buildManager(card,member,force=false){
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN'||String(member.role||'').toUpperCase()==='HEAD_ADMIN')return;
  if(force)card.querySelector(':scope > .ec-role-manager')?.remove();
  if(card.querySelector(':scope > .ec-role-manager'))return;

  const wrap=document.createElement('section');
  wrap.className='ec-role-manager';
  const assigned=assignedRegions(member.id);
  wrap.innerHTML=`<div class="ec-role-manager-head"><div><strong>Rollen & Moderation</strong><small>Basisrolle, Regionaladmin und Supporter-Moderation getrennt steuern</small></div></div>
    <div class="ec-role-manager-grid">
      <label><span>Basisrolle</span><select class="ec-base-role"><option value="MEMBER">Mitglied</option><option value="SUPPORTER">Supporter</option><option value="ADMIN">Community Admin</option></select></label>
      <label><span>Region</span><select class="ec-region-role"><option value="">Region wählen</option>${regions.map(r=>`<option value="${r.slug}">${r.name}</option>`).join('')}</select></label>
    </div>
    <div class="ec-role-manager-actions ec-role-basic-actions"><button type="button" data-action="base">Basisrolle speichern</button><button type="button" data-action="regional-on">Regional Admin vergeben</button><button type="button" data-action="regional-off">Regional Admin entfernen</button></div>
    <div class="ec-role-manager-current">${assigned.length?`Regional Admin: ${assigned.map(regionName).join(', ')}`:'Keine regionale Adminrolle'}</div>
    <div class="ec-moderation-manager">
      <div class="ec-moderation-title"><strong>Supporter-Moderation</strong><small>Regional oder global über alle aktiven Regionen</small></div>
      <div class="ec-moderation-permissions"><label><input type="checkbox" value="FORUM" checked> Forum</label><label><input type="checkbox" value="GROUPS"> Gruppen</label></div>
      <div class="ec-role-manager-actions ec-moderation-actions"><button type="button" data-action="moderation-region-on">Regional vergeben</button><button type="button" data-action="moderation-region-off">Regional entfernen</button><button type="button" data-action="moderation-global-on">Global vergeben</button><button type="button" data-action="moderation-global-off">Global entfernen</button></div>
      <div class="ec-role-manager-current ec-moderation-current">${currentModerationText(member)}</div>
    </div>
    <p class="ec-role-manager-status" aria-live="polite"></p>`;

  const base=wrap.querySelector('.ec-base-role');
  base.value=['MEMBER','SUPPORTER','ADMIN'].includes(String(member.role||'').toUpperCase())?String(member.role).toUpperCase():'MEMBER';
  const status=wrap.querySelector('.ec-role-manager-status');
  const selectedPermissions=()=>[...wrap.querySelectorAll('.ec-moderation-permissions input:checked')].map(input=>input.value);
  const selectedRegion=()=>wrap.querySelector('.ec-region-role').value;
  wrap.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;status.textContent='Wird gespeichert …';status.className='ec-role-manager-status';
    try{
      const action=button.dataset.action;
      if(action==='base')await setBaseRole(member,base.value,status);
      else if(action==='regional-on'||action==='regional-off')await setRegional(member,selectedRegion(),action==='regional-on',status);
      else {
        const global=action.includes('global');
        const enabled=action.endsWith('-on');
        const slugs=global?regions.map(r=>r.slug):[selectedRegion()].filter(Boolean);
        if(!slugs.length)throw new Error('Bitte Region wählen.');
        await setModeration(member,slugs,selectedPermissions(),enabled,status);
      }
      status.classList.add('ok');
      await refresh();
      window.dispatchEvent(new CustomEvent('ec:region-change',{detail:{reason:'role-update'}}));
    }catch(error){status.textContent=error.message||'Speichern fehlgeschlagen.';status.classList.add('bad')}
    finally{button.disabled=false}
  });
  card.appendChild(wrap);
}

function decorate(force=false){
  if(String(viewer?.role||'').toUpperCase()!=='HEAD_ADMIN')return;
  document.querySelectorAll('.admin-member-card').forEach(card=>{const member=memberForCard(card);if(member)buildManager(card,member,force)});
}

function boot(){
  void refresh();
  const observer=new MutationObserver(()=>{clearTimeout(window.__ecAdminRoleManager);window.__ecAdminRoleManager=setTimeout(()=>decorate(false),80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('ec:region-change',()=>setTimeout(refresh,80));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
