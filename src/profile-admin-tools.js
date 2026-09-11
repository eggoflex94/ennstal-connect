import { supabase } from './supabaseClient';

let timer = null;
let opening = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const roleLabel = (r) => ({HEAD_ADMIN:'Hauptadmin',ADMIN:'Global Admin',SUPPORTER:'Supporter',MEMBER:'Mitglied'}[String(r||'MEMBER').toUpperCase()] || r);
const nameOf = (p) => p?.nickname || [p?.first_name,p?.last_name].filter(Boolean).join(' ') || 'Mitglied';
const bool = (o,k) => Boolean(o?.[k]);

async function resolveTarget(host){
  const id = host?.dataset?.profileId || host?.getAttribute?.('data-profile-id');
  if(id){ const {data}=await supabase.from('profiles').select('id,nickname,first_name,last_name').eq('id',id).maybeSingle(); if(data) return data; }
  return null;
}

async function loadContext(targetId){
  const {data,error}=await supabase.rpc('profile_admin_tool_context',{p_target:targetId});
  if(error) throw error;
  return data;
}

function closeModal(){ document.querySelector('.ec-admin-tools-backdrop')?.remove(); }
function section(title,body){ return `<section class="ec-admin-tools-section"><h3>${esc(title)}</h3>${body}</section>`; }
function actionButton(label,action,cls='secondary-button'){ return `<button type="button" class="${cls}" data-action="${action}">${esc(label)}</button>`; }

async function rpc(name,args,success){
  const {error}=await supabase.rpc(name,args);
  if(error) throw error;
  if(success) alert(success);
}

async function openLogbook(){
  const {data,error}=await supabase.rpc('head_admin_audit_feed',{p_limit:500});
  if(error) return alert(error.message);
  const backdrop=document.createElement('div');
  backdrop.className='ec-admin-tools-backdrop ec-logbook-backdrop';
  backdrop.innerHTML=`<div class="ec-admin-tools-modal ec-logbook-modal" role="dialog" aria-modal="true"><header><div><span class="eyebrow">HAUPTADMIN</span><h2>Admin-Logbuch</h2><p>Chronologische Übersicht aller protokollierten Admin- und Moderationsaktionen.</p></div><button type="button" class="ec-admin-tools-close" aria-label="Schließen">×</button></header><div class="ec-logbook-list"></div></div>`;
  const list=backdrop.querySelector('.ec-logbook-list');
  (data||[]).forEach(row=>{
    const item=document.createElement('article'); item.className='ec-logbook-row';
    item.innerHTML=`<div class="ec-logbook-actor"><img src="${esc(row.actor_star||'/role-star-member.svg')}" alt=""><strong>${esc(row.actor_nickname||'System')}</strong></div><div class="ec-logbook-main"><strong>${esc(row.action_label||row.action_key)}</strong><span>bei ${row.target_nickname && row.target_nickname!=='—' ? `<b>${esc(row.target_nickname)}</b>` : esc(row.object_type||'System')}</span><small>${esc(new Date(row.created_at).toLocaleString('de-AT'))}</small><p><b>Begründung:</b> ${esc(row.reason||'Keine gesonderte Begründung gespeichert.')}</p></div>`;
    list.append(item);
  });
  if(!data?.length) list.innerHTML='<p class="ec-profile-admin-empty">Noch keine protokollierten Einträge vorhanden.</p>';
  backdrop.querySelector('.ec-admin-tools-close').onclick=()=>backdrop.remove();
  backdrop.onclick=(e)=>{if(e.target===backdrop)backdrop.remove();};
  document.body.append(backdrop);
}

function buildHeadSections(ctx){
  const target=ctx.target, tp=ctx.target_permissions||{}, regions=ctx.regions||[], assignments=ctx.regional_assignments||[];
  const activeIds=new Set(assignments.map(a=>a.region_id));
  const permissionDefs=[['manage_points','Punkte'],['view_profile_visits','Statistik'],['manage_reports','Meldungen / Verwarnungen'],['manage_groups','Gruppenverwaltung'],['manage_homepage','Startseite'],['manage_members','Mitglieder'],['manage_news','Neuigkeiten'],['manage_events','Events'],['manage_media','Medien'],['manage_messages','Nachrichten'],['manage_roles','Rollen'],['manage_admins','Adminverwaltung']];
  const globalChecks=permissionDefs.map(([k,l])=>`<label class="ec-admin-check"><input type="checkbox" data-global-permission="${k}" ${bool(tp,k)?'checked':''}><span>${esc(l)}</span></label>`).join('');
  const regionalBlocks=regions.map(r=>{
    const a=assignments.find(x=>x.region_id===r.id); const perms=new Set(a?.permissions||[]);
    return `<div class="ec-admin-region-card" data-region-id="${r.id}" data-region-slug="${esc(r.slug)}"><div class="ec-admin-region-head"><strong>${esc(r.name)}</strong><label><input type="checkbox" data-regional-enabled ${activeIds.has(r.id)?'checked':''}> Regional Admin</label></div><div class="ec-admin-region-permissions">${[['FORUM','Forum'],['GROUPS','Gruppen'],['EVENTS','Events'],['NEWS','Neuigkeiten'],['HOMEPAGE','Startseite'],['MEMBERS','Mitglieder'],['BUSINESSES','Unternehmen'],['ANNOUNCEMENTS','Ankündigungen']].map(([k,l])=>`<label class="ec-admin-check"><input type="checkbox" data-regional-permission="${k}" ${perms.has(k)?'checked':''}><span>${l}</span></label>`).join('')}</div><button type="button" class="secondary-button" data-action="save-region">Regionale Rechte speichern</button></div>`;
  }).join('');
  return [
    section('Rolle & Konto',`<div class="ec-admin-tools-grid">${actionButton('Als Mitglied','role-member')}${actionButton('Als Supporter','role-supporter')}${actionButton('Als Global Admin','role-admin','primary-button')}${target.account_badge==='BUSINESS'?actionButton('Unternehmenskonto entfernen','business-remove','danger-button'):actionButton('Zum Unternehmenskonto machen','business-add')}</div><div class="ec-admin-current">Aktuell: <strong>${esc(roleLabel(target.role))}</strong>${target.account_badge==='BUSINESS'?' · Unternehmenskonto':''}</div>`),
    section('Globale Rechte',`<div class="ec-admin-check-grid">${globalChecks}</div>${actionButton('Globale Rechte speichern','save-global','primary-button')}<p class="ec-admin-note">Nur der Hauptadmin kann diese Rechte ändern.</p>`),
    section('Regionale Admin-Rechte',regionalBlocks || '<p>Keine Regionen vorhanden.</p>'),
    section('Verifizierung',`<div class="ec-admin-tools-grid">${actionButton('Verifizierung einfordern','verify-request')}${target.is_verified?actionButton('Verifizierung entfernen','verify-revoke','danger-button'):actionButton('Verifizierung freigeben','verify-approve','primary-button')}</div><p class="ec-admin-note">Die endgültige Freigabe bleibt ausschließlich beim Hauptadmin.</p>`),
    section('Moderation & Punkte',`<div class="ec-admin-tools-grid">${actionButton('Verwarnung mit Grund','warn')}${actionButton('Punkte vergeben','points-plus')}${actionButton('Punkte abziehen','points-minus','danger-button')}${actionButton('Admin-Logbuch öffnen','logbook')}</div>`)
  ].join('');
}

function buildLimitedSections(ctx){
  const p=ctx.viewer?.permissions||{}; const regional=(ctx.viewer?.regional_regions||[]).includes(ctx.target?.home_region_id);
  const actions=[];
  if(bool(p,'manage_reports') || ctx.viewer?.role==='ADMIN') actions.push(actionButton('Verwarnung mit Grund','warn'));
  if(bool(p,'manage_points') || ctx.viewer?.role==='ADMIN' || regional) actions.push(actionButton('Punkte vergeben','points-plus'),actionButton('Punkte abziehen','points-minus','danger-button'));
  if(ctx.viewer?.role==='ADMIN' || regional) actions.push(actionButton('Verifizierung einfordern','verify-request'));
  const rights=[];
  if(bool(p,'view_profile_visits')) rights.push('Statistik'); if(bool(p,'manage_reports')) rights.push('Meldungen / Verwarnungen'); if(bool(p,'manage_groups')) rights.push('Gruppenverwaltung'); if(bool(p,'manage_homepage')) rights.push('Startseite'); if(bool(p,'manage_points')) rights.push('Punkte');
  return section('Freigegebene Werkzeuge',`<div class="ec-admin-tools-grid">${actions.join('')||'<p>Für dieses Profil sind keine direkten Werkzeuge freigegeben.</p>'}</div><p class="ec-admin-note">Deine freigegebenen Rechte: ${esc(rights.join(', ')||'nur regionale, serverseitig geprüfte Rechte')}.</p>`);
}

async function openTools(targetId){
  if(opening) return; opening=true;
  try{
    const ctx=await loadContext(targetId); const target=ctx.target;
    closeModal();
    const backdrop=document.createElement('div'); backdrop.className='ec-admin-tools-backdrop';
    backdrop.innerHTML=`<div class="ec-admin-tools-modal" role="dialog" aria-modal="true"><header><div><span class="eyebrow">ADMIN TOOLS</span><h2>${esc(nameOf(target))}</h2><p>Alle für dich freigegebenen Verwaltungsaktionen direkt im Profil.</p></div><button type="button" class="ec-admin-tools-close" aria-label="Schließen">×</button></header><div class="ec-admin-tools-content">${ctx.viewer?.is_head?buildHeadSections(ctx):buildLimitedSections(ctx)}</div></div>`;
    backdrop.querySelector('.ec-admin-tools-close').onclick=()=>backdrop.remove(); backdrop.onclick=(e)=>{if(e.target===backdrop)backdrop.remove();};
    backdrop.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=async()=>{
      const a=btn.dataset.action;
      try{
        if(a.startsWith('role-')){ const nr={ 'role-member':'MEMBER','role-supporter':'SUPPORTER','role-admin':'ADMIN'}[a]; if(confirm(`${nameOf(target)} wirklich auf ${roleLabel(nr)} setzen?`)){await rpc('admin_set_role',{target_user:target.id,new_role:nr},'Rolle wurde geändert.'); backdrop.remove(); location.reload();} }
        else if(a==='business-add'){ const company=prompt('Firmenname:',target.company_name||''); if(company===null)return; const desc=prompt('Beschreibung / Begründung:',target.company_description||'')||''; await rpc('admin_set_business_account',{p_user_id:target.id,p_enabled:true,p_company_name:company,p_company_description:desc},'Unternehmenskonto wurde aktiviert.'); backdrop.remove(); location.reload(); }
        else if(a==='business-remove'){ if(confirm('Unternehmenskonto wirklich entfernen?')){await rpc('admin_set_business_account',{p_user_id:target.id,p_enabled:false,p_company_name:null,p_company_description:'Unternehmenskonto entfernt'},'Unternehmenskonto wurde entfernt.'); backdrop.remove(); location.reload();} }
        else if(a==='warn'){ const reason=prompt('Begründung der Verwarnung:'); if(reason?.trim()) await rpc('admin_warn_user',{target_user:target.id,warning_text:reason.trim()},'Verwarnung wurde gesendet.'); }
        else if(a==='verify-request'){ const reason=prompt('Grund für die Verifizierungsanforderung:'); if(!reason?.trim())return; const days=Math.max(1,Math.min(30,Number(prompt('Frist in Tagen:','7'))||7)); await rpc('admin_require_profile_verification',{p_target_user:target.id,p_reason:reason.trim(),p_due_days:days},'Verifizierung wurde angefordert.'); }
        else if(a==='verify-approve'){ if(confirm('Profil wirklich verifizieren?')){await rpc('admin_set_profile_verification',{p_user_id:target.id,p_verified:true},'Profil wurde verifiziert.'); backdrop.remove(); location.reload();} }
        else if(a==='verify-revoke'){ if(confirm('Verifizierung wirklich entfernen?')){await rpc('admin_set_profile_verification',{p_user_id:target.id,p_verified:false},'Verifizierung wurde entfernt.'); backdrop.remove(); location.reload();} }
        else if(a==='points-plus'||a==='points-minus'){ const amount=Math.abs(Number(prompt('Punkteanzahl:','1'))||0); if(!amount)return; const reason=prompt('Begründung:'); if(!reason?.trim())return; await rpc('award_member_points',{target_user:target.id,point_delta:a==='points-plus'?amount:-amount,reason_text:reason.trim(),category_text:'ADMIN_ADJUSTMENT',notify_member:true,source_type_text:'PROFILE_ADMIN_TOOLS',source_id_value:target.id},'Punkte wurden gespeichert.'); }
        else if(a==='save-global'){ const values={manage_members:false,manage_points:false,manage_messages:false,manage_media:false,manage_roles:false,manage_admins:false,view_profile_visits:false,manage_news:false,manage_groups:false,manage_events:false,manage_marketplace:false,manage_friend_requests:false,manage_homepage:false,manage_reports:false}; backdrop.querySelectorAll('[data-global-permission]').forEach(i=>values[i.dataset.globalPermission]=i.checked); await rpc('admin_set_permissions',{target_user:target.id,p_manage_members:values.manage_members,p_manage_points:values.manage_points,p_manage_messages:values.manage_messages,p_manage_media:values.manage_media,p_manage_roles:values.manage_roles,p_manage_admins:values.manage_admins,p_view_profile_visits:values.view_profile_visits,p_manage_news:values.manage_news,p_manage_groups:values.manage_groups,p_manage_events:values.manage_events,p_manage_marketplace:values.manage_marketplace,p_manage_friend_requests:values.manage_friend_requests,p_manage_homepage:values.manage_homepage,p_manage_reports:values.manage_reports},'Globale Rechte wurden gespeichert.'); }
        else if(a==='save-region'){ const card=btn.closest('.ec-admin-region-card'); const region=ctx.regions.find(r=>r.id===card.dataset.regionId); const enabled=card.querySelector('[data-regional-enabled]').checked; const perms=[...card.querySelectorAll('[data-regional-permission]:checked')].map(i=>i.dataset.regionalPermission); await rpc('ec_set_regional_admin',{p_target:target.id,p_region_slug:region.slug,p_enabled:enabled}); if(enabled && perms.length) await rpc('ec_set_regional_moderator',{p_target:target.id,p_region_slug:region.slug,p_permissions:perms,p_enabled:true}); else if(!enabled) await rpc('ec_set_regional_moderator',{p_target:target.id,p_region_slug:region.slug,p_permissions:[],p_enabled:false}); alert('Regionale Rechte wurden gespeichert.'); }
        else if(a==='logbook') await openLogbook();
      }catch(error){ alert(error.message||String(error)); }
    });
    document.body.append(backdrop);
  }catch(error){ console.warn('[profile-admin-tools]',error.message||error); }
  finally{opening=false;}
}

async function enhance(host){
  if(!host || host.querySelector('[data-profile-admin-button="1"]')) return;
  const target=await resolveTarget(host); if(!target)return;
  try{ await loadContext(target.id); }catch{return;}
  const button=document.createElement('button'); button.type='button'; button.className='primary-button ec-profile-admin-button'; button.dataset.profileAdminButton='1'; button.textContent='Admin Tools'; button.onclick=()=>void openTools(target.id);
  const hero=host.querySelector('.member-profile-hero,.modal-profile-header');
  if(hero) hero.insertAdjacentElement('afterend',button); else host.prepend(button);
}

function sync(){ document.querySelectorAll('.member-profile-page,.profile-modal').forEach(h=>void enhance(h)); }
function schedule(){ clearTimeout(timer); timer=setTimeout(sync,80); }
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:navigate',schedule); window.addEventListener('ec:open-profile',()=>setTimeout(sync,60));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
setTimeout(sync,250);

export {};
