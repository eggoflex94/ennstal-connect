import { supabase } from './supabaseClient';

let timer=null;
let busy=false;
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roleLabel=(r)=>({HEAD_ADMIN:'Hauptadmin',ADMIN:'Global Admin',SUPPORTER:'Supporter',MEMBER:'Mitglied'}[String(r||'MEMBER').toUpperCase()]||r);
const nameOf=(p)=>p?.nickname||[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Mitglied';
const bool=(o,k)=>Boolean(o?.[k]);
const section=(title,body)=>`<section class="ec-admin-tools-section"><h3>${esc(title)}</h3>${body}</section>`;
const btn=(label,action,cls='secondary-button')=>`<button type="button" class="${cls}" data-action="${action}">${esc(label)}</button>`;

async function context(targetId){const {data,error}=await supabase.rpc('profile_admin_tool_context',{p_target:targetId});if(error)throw error;return data;}
async function rpc(name,args){const {error}=await supabase.rpc(name,args);if(error)throw error;}

function limited(ctx){
  const p=ctx.viewer?.permissions||{};
  const regionalIds=ctx.viewer?.regional_regions||[];
  const regional=regionalIds.includes(ctx.target?.home_region_id);
  const actions=[];
  if(bool(p,'manage_reports'))actions.push(btn('Verwarnung mit Grund','warn'));
  if(bool(p,'manage_points')||regional)actions.push(btn('Punkte vergeben','points-plus'),btn('Punkte abziehen','points-minus','danger-button'));
  if(bool(p,'manage_reports')||regional)actions.push(btn('Verifizierung einfordern','verify-request'));
  const rights=[];
  [['view_profile_visits','Statistik'],['manage_reports','Meldungen / Verwarnungen'],['manage_groups','Gruppenverwaltung'],['manage_homepage','Startseite'],['manage_points','Punkte'],['manage_news','Neuigkeiten'],['manage_events','Events'],['manage_members','Mitglieder']].forEach(([k,l])=>{if(bool(p,k))rights.push(l);});
  if(regional)rights.push('Regionale Rechte');
  return section('Freigegebene Werkzeuge',`<div class="ec-admin-tools-grid">${actions.join('')||'<p>Für dieses Profil sind keine direkten Werkzeuge freigegeben.</p>'}</div><p class="ec-admin-note">Sichtbar sind nur die vom Hauptadmin freigegebenen Rechte: ${esc(rights.join(', ')||'keine direkten Profilaktionen')}.</p>`);
}

function head(ctx){
  const t=ctx.target,tp=ctx.target_permissions||{},regions=ctx.regions||[],assign=ctx.regional_assignments||[];
  const defs=[['manage_points','Punkte'],['view_profile_visits','Statistik'],['manage_reports','Meldungen / Verwarnungen'],['manage_groups','Gruppenverwaltung'],['manage_homepage','Startseite'],['manage_members','Mitglieder'],['manage_news','Neuigkeiten'],['manage_events','Events'],['manage_media','Medien'],['manage_messages','Nachrichten'],['manage_roles','Rollen'],['manage_admins','Adminverwaltung']];
  const checks=defs.map(([k,l])=>`<label class="ec-admin-check"><input type="checkbox" data-global-permission="${k}" ${bool(tp,k)?'checked':''}><span>${esc(l)}</span></label>`).join('');
  const active=new Set(assign.map(a=>a.region_id));
  const regional=regions.map(r=>{const a=assign.find(x=>x.region_id===r.id);const perms=new Set(a?.permissions||[]);return `<div class="ec-admin-region-card" data-region-id="${r.id}" data-region-slug="${esc(r.slug)}"><div class="ec-admin-region-head"><strong>${esc(r.name)}</strong><label><input type="checkbox" data-regional-enabled ${active.has(r.id)?'checked':''}> Regional Admin</label></div><div class="ec-admin-region-permissions">${[['FORUM','Forum'],['GROUPS','Gruppen'],['EVENTS','Events'],['NEWS','Neuigkeiten'],['HOMEPAGE','Startseite'],['MEMBERS','Mitglieder'],['BUSINESSES','Unternehmen'],['ANNOUNCEMENTS','Ankündigungen']].map(([k,l])=>`<label class="ec-admin-check"><input type="checkbox" data-regional-permission="${k}" ${perms.has(k)?'checked':''}><span>${l}</span></label>`).join('')}</div>${btn('Regionale Rechte speichern','save-region')}</div>`;}).join('');
  return [
    section('Rolle & Konto',`<div class="ec-admin-tools-grid">${btn('Als Mitglied','role-member')}${btn('Als Supporter','role-supporter')}${btn('Als Global Admin','role-admin','primary-button')}${t.account_badge==='BUSINESS'?btn('Unternehmenskonto entfernen','business-remove','danger-button'):btn('Zum Unternehmenskonto machen','business-add')}</div><p class="ec-admin-current">Aktuell: <strong>${esc(roleLabel(t.role))}</strong>${t.account_badge==='BUSINESS'?' · Unternehmenskonto':''}</p>`),
    section('Globale Rechte',`<div class="ec-admin-check-grid">${checks}</div>${btn('Globale Rechte speichern','save-global','primary-button')}<p class="ec-admin-note">Globale und regionale Rechte können nur vom Hauptadmin verändert werden.</p>`),
    section('Regionale Admin-Rechte',regional||'<p>Keine aktiven Regionen vorhanden.</p>'),
    section('Verifizierung',`<div class="ec-admin-tools-grid">${btn('Verifizierung einfordern','verify-request')}${t.is_verified?btn('Verifizierung entfernen','verify-revoke','danger-button'):btn('Verifizierung freigeben','verify-approve','primary-button')}</div><p class="ec-admin-note">Die endgültige Freigabe bleibt ausschließlich beim Hauptadmin.</p>`),
    section('Moderation & Punkte',`<div class="ec-admin-tools-grid">${btn('Verwarnung mit Grund','warn')}${btn('Punkte vergeben','points-plus')}${btn('Punkte abziehen','points-minus','danger-button')}${btn('Admin-Logbuch öffnen','logbook')}</div>`)
  ].join('');
}

async function logbook(){
  const {data,error}=await supabase.rpc('head_admin_audit_feed',{p_limit:500});if(error)return alert(error.message);
  const b=document.createElement('div');b.className='ec-admin-tools-backdrop ec-logbook-backdrop';b.innerHTML=`<div class="ec-admin-tools-modal ec-logbook-modal" role="dialog" aria-modal="true"><header><div><span class="eyebrow">HAUPTADMIN</span><h2>Admin-Logbuch</h2></div><button class="ec-admin-tools-close" type="button">×</button></header><div class="ec-logbook-list"></div></div>`;
  const list=b.querySelector('.ec-logbook-list');(data||[]).forEach(row=>{const a=document.createElement('article');a.className='ec-logbook-row';a.innerHTML=`<div class="ec-logbook-actor"><img src="${esc(row.actor_star||'/role-star-member.svg')}" alt=""><strong>${esc(row.actor_nickname||'System')}</strong></div><div class="ec-logbook-main"><strong>${esc(row.action_label||row.action_key)}</strong><span>${row.target_nickname&&row.target_nickname!=='—'?`bei <b>${esc(row.target_nickname)}</b>`:esc(row.object_type||'System')}</span><small>${esc(new Date(row.created_at).toLocaleString('de-AT'))}</small><p><b>Begründung:</b> ${esc(row.reason||'Keine gesonderte Begründung gespeichert.')}</p></div>`;list.append(a);});
  if(!data?.length)list.innerHTML='<p>Noch keine Einträge vorhanden.</p>';
  b.querySelector('.ec-admin-tools-close').onclick=()=>b.remove();b.onclick=e=>{if(e.target===b)b.remove();};document.body.append(b);
}

async function openTools(targetId){
  if(busy)return;busy=true;
  try{
    const ctx=await context(targetId),t=ctx.target;
    document.querySelector('.ec-admin-tools-backdrop')?.remove();
    const b=document.createElement('div');b.className='ec-admin-tools-backdrop';b.innerHTML=`<div class="ec-admin-tools-modal" role="dialog" aria-modal="true"><header><div><span class="eyebrow">ADMIN TOOLS</span><h2>${esc(nameOf(t))}</h2><p>Alle Verwaltungsaktionen direkt im Profil.</p></div><button class="ec-admin-tools-close" type="button">×</button></header><div class="ec-admin-tools-content">${ctx.viewer?.is_head?head(ctx):limited(ctx)}</div></div>`;
    b.querySelector('.ec-admin-tools-close').onclick=()=>b.remove();b.onclick=e=>{if(e.target===b)b.remove();};
    b.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{const a=button.dataset.action;try{
      if(a.startsWith('role-')){const r={'role-member':'MEMBER','role-supporter':'SUPPORTER','role-admin':'ADMIN'}[a];if(confirm(`${nameOf(t)} wirklich auf ${roleLabel(r)} setzen?`)){await rpc('admin_set_role',{target_user:t.id,new_role:r});location.reload();}}
      else if(a==='business-add'){const company=prompt('Firmenname:',t.company_name||'');if(company===null)return;const desc=prompt('Beschreibung / Begründung:',t.company_description||'')||'';await rpc('admin_set_business_account',{p_user_id:t.id,p_enabled:true,p_company_name:company,p_company_description:desc});location.reload();}
      else if(a==='business-remove'){if(confirm('Unternehmenskonto wirklich entfernen?')){await rpc('admin_set_business_account',{p_user_id:t.id,p_enabled:false,p_company_name:null,p_company_description:'Unternehmenskonto entfernt'});location.reload();}}
      else if(a==='warn'){const reason=prompt('Begründung der Verwarnung:');if(reason?.trim())await rpc('admin_warn_user',{target_user:t.id,warning_text:reason.trim()});}
      else if(a==='verify-request'){const reason=prompt('Grund für die Verifizierungsanforderung:');if(!reason?.trim())return;const days=Math.max(1,Math.min(30,Number(prompt('Frist in Tagen:','7'))||7));await rpc('admin_require_profile_verification',{p_target_user:t.id,p_reason:reason.trim(),p_due_days:days});}
      else if(a==='verify-approve'){if(confirm('Profil wirklich verifizieren?')){await rpc('admin_set_profile_verification',{p_user_id:t.id,p_verified:true});location.reload();}}
      else if(a==='verify-revoke'){if(confirm('Verifizierung wirklich entfernen?')){await rpc('admin_set_profile_verification',{p_user_id:t.id,p_verified:false});location.reload();}}
      else if(a==='points-plus'||a==='points-minus'){const n=Math.abs(Number(prompt('Punkteanzahl:','1'))||0);if(!n)return;const reason=prompt('Begründung:');if(!reason?.trim())return;await rpc('award_member_points',{target_user:t.id,point_delta:a==='points-plus'?n:-n,reason_text:reason.trim(),category_text:'ADMIN_ADJUSTMENT',notify_member:true,source_type_text:'PROFILE_ADMIN_TOOLS',source_id_value:t.id});}
      else if(a==='save-global'){const v={manage_members:false,manage_points:false,manage_messages:false,manage_media:false,manage_roles:false,manage_admins:false,view_profile_visits:false,manage_news:false,manage_groups:false,manage_events:false,manage_marketplace:false,manage_friend_requests:false,manage_homepage:false,manage_reports:false};b.querySelectorAll('[data-global-permission]').forEach(i=>v[i.dataset.globalPermission]=i.checked);await rpc('admin_set_permissions',{target_user:t.id,p_manage_members:v.manage_members,p_manage_points:v.manage_points,p_manage_messages:v.manage_messages,p_manage_media:v.manage_media,p_manage_roles:v.manage_roles,p_manage_admins:v.manage_admins,p_view_profile_visits:v.view_profile_visits,p_manage_news:v.manage_news,p_manage_groups:v.manage_groups,p_manage_events:v.manage_events,p_manage_marketplace:v.manage_marketplace,p_manage_friend_requests:v.manage_friend_requests,p_manage_homepage:v.manage_homepage,p_manage_reports:v.manage_reports});alert('Globale Rechte wurden gespeichert.');}
      else if(a==='save-region'){const card=button.closest('.ec-admin-region-card'),region=ctx.regions.find(r=>r.id===card.dataset.regionId),enabled=card.querySelector('[data-regional-enabled]').checked,perms=[...card.querySelectorAll('[data-regional-permission]:checked')].map(i=>i.dataset.regionalPermission);await rpc('ec_set_regional_admin',{p_target:t.id,p_region_slug:region.slug,p_enabled:enabled});await rpc('ec_set_regional_moderator',{p_target:t.id,p_region_slug:region.slug,p_permissions:enabled?perms:[],p_enabled:enabled&&perms.length>0});alert('Regionale Rechte wurden gespeichert.');}
      else if(a==='logbook'&&ctx.viewer?.is_head)await logbook();
    }catch(err){alert(err.message||String(err));}});
    document.body.append(b);
  }catch(err){console.warn('[profile-admin-tools-v2]',err.message||err);}finally{busy=false;}
}

async function enhance(host){
  const targetId=host?.dataset?.profileId||host?.getAttribute?.('data-profile-id');if(!targetId)return;
  const existing=host.querySelector('[data-profile-admin-button="1"],[data-profile-admin-v2="1"]');if(existing)return;
  let ctx;try{ctx=await context(targetId);}catch{return;}
  const button=document.createElement('button');button.type='button';button.className='primary-button ec-profile-admin-button';button.dataset.profileAdminV2='1';button.textContent='Admin Tools';button.onclick=()=>void openTools(targetId);
  const actions=host.querySelector('.member-profile-actions');
  if(actions)actions.append(button);else{const hero=host.querySelector('.member-profile-hero,.modal-profile-header');if(hero)hero.insertAdjacentElement('afterend',button);else host.prepend(button);}
  host.querySelectorAll('.member-admin-tools,.feature-unlocks,.head-admin-media-tools,.member-business-tool').forEach(el=>el.style.setProperty('display','none','important'));
}

function sync(){document.querySelectorAll('.member-profile-page[data-profile-id],.profile-modal[data-profile-id]').forEach(h=>void enhance(h));}
function schedule(){clearTimeout(timer);timer=setTimeout(sync,60);}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:navigate',schedule);window.addEventListener('ec:open-profile',()=>setTimeout(sync,40));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();setTimeout(sync,180);

export {};
