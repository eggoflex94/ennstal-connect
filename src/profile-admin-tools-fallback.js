import { preparePrivilegedAction, supabase } from './supabaseClient';

const FEATURE_LABELS={FORUM_POSTING:'Forum',MESSAGING:'Nachrichten',FRIEND_REQUESTS:'Freundschaftsanfragen'};
const ROLE_LABELS={HEAD_ADMIN:'Hauptadmin',ADMIN:'Community Admin',SUPPORTER:'Supporter',MEMBER:'Mitglied'};
const REGIONAL_PERMISSION_LABELS={FORUM:'Forum',GROUPS:'Gruppen',EVENTS:'Veranstaltungen',NEWS:'Neuigkeiten',HOMEPAGE:'Startseite',MEMBERS:'Mitglieder',BUSINESSES:'Unternehmen',ANNOUNCEMENTS:'Ankündigungen'};
const USER_PERMISSION_LABELS={manage_members:'Mitglieder verwalten',manage_points:'Punkte verwalten',manage_messages:'Nachrichten moderieren',manage_media:'Medien moderieren',manage_roles:'Rollen verwalten',manage_admins:'Admins verwalten',view_profile_visits:'Profilbesuche sehen',manage_news:'Neuigkeiten verwalten',manage_groups:'Gruppen verwalten',manage_events:'Veranstaltungen verwalten',manage_marketplace:'Marktplatz verwalten',manage_friend_requests:'Freundschaftsanfragen moderieren',manage_homepage:'Startseite verwalten',manage_reports:'Meldungen verwalten'};

let mounting=false;
let scheduled=null;
let mountTimers=[];
const roleOf=(v)=>String(v||'MEMBER').toUpperCase();
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

async function currentAccess(targetId){
  if(!supabase||!targetId)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.id||user.id===targetId)return null;
  const [headResult,targetResult]=await Promise.all([
    supabase.rpc('ec_is_head_admin'),
    supabase.from('profiles').select('id,nickname,first_name,last_name,role,account_status,home_region_id,community_points,purchase_points,forum_moderator,is_verified,is_test_account,account_badge').eq('id',targetId).maybeSingle()
  ]);
  const isHead=headResult?.data===true;
  const target=targetResult?.data||{id:targetId,role:'MEMBER',account_status:'ACTIVE'};
  if(isHead){
    const [{data:regions},{data:regionalAdmins},{data:regionalMods},{data:targetPermissions}]=await Promise.all([
      supabase.from('regions').select('id,slug,name').eq('is_active',true).order('name'),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',targetId),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',targetId),
      supabase.from('user_permissions').select('*').eq('user_id',targetId).maybeSingle()
    ]);
    return{user,viewer:{id:user.id,role:'HEAD_ADMIN',account_status:'ACTIVE'},target,isHead:true,isGlobal:false,isRegionalForTarget:false,permissions:{},regions:regions||[],targetRegionalAdmins:regionalAdmins||[],targetRegionalMods:regionalMods||[],targetPermissions:targetPermissions||{}};
  }
  const [{data:viewer},{data:regional},{data:regionalMods},{data:permissions}]=await Promise.all([
    supabase.from('profiles').select('id,role,account_status,forum_moderator').eq('id',user.id).maybeSingle(),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
    supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true),
    supabase.from('user_permissions').select('*').eq('user_id',user.id).maybeSingle()
  ]);
  if(!viewer||viewer.account_status!=='ACTIVE')return null;
  const viewerRole=roleOf(viewer.role),targetRole=roleOf(target.role);
  const isGlobal=viewerRole==='ADMIN';
  if(targetRole==='HEAD_ADMIN')return null;
  const isRegionalForTarget=Boolean(target.home_region_id&&(regional||[]).some(r=>r.active!==false&&r.region_id===target.home_region_id));
  const regionalPermissions=new Set((regionalMods||[]).filter(r=>!target.home_region_id||r.region_id===target.home_region_id).flatMap(r=>Array.isArray(r.permissions)?r.permissions:[]).map(v=>String(v).toUpperCase()));
  const p=permissions||{};
  const hasGrantedTools=Boolean(viewer.forum_moderator||p.manage_members||p.manage_points||p.manage_reports||p.manage_messages||p.manage_media||regionalPermissions.size);
  if(!isGlobal&&!isRegionalForTarget&&!hasGrantedTools)return null;
  return{user,viewer,target,isHead:false,isGlobal,isRegionalForTarget,permissions:p,regionalPermissions,regions:[]};
}

function removeLegacyProfileAdminButtons(page){
  page.querySelector('.member-admin-tools')?.setAttribute('hidden','');
  page.querySelectorAll('button').forEach(button=>{const text=String(button.textContent||'').trim().toLowerCase();if(/punkteliste|punkte vergeben/.test(text))button.style.setProperty('display','none','important');});
}
function targetName(ctx){return ctx.target?.nickname||[ctx.target?.first_name,ctx.target?.last_name].filter(Boolean).join(' ')||'Mitglied';}
function actionButton(label,action,klass=''){return `<button type="button" class="ec-profile-admin-action ${klass}" data-fallback-admin-action="${esc(action)}">${esc(label)}</button>`;}
function permissionChecked(ctx,key){return ctx.targetPermissions?.[key]===true?'checked':'';}
function regionalAdminActive(ctx,regionId){return (ctx.targetRegionalAdmins||[]).some(r=>r.region_id===regionId&&r.active!==false);}
function regionalModRow(ctx,regionId){return (ctx.targetRegionalMods||[]).find(r=>r.region_id===regionId&&r.active!==false);}
function canWarn(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.permissions?.manage_members||ctx.regionalPermissions?.has('MEMBERS');}
function canSuspend(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.permissions?.manage_members||ctx.regionalPermissions?.has('MEMBERS');}
function canPoints(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.permissions?.manage_points;}
function canForumLock(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.viewer?.forum_moderator||ctx.permissions?.manage_members||ctx.regionalPermissions?.has('FORUM');}
function canMessagingLock(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.permissions?.manage_messages||ctx.permissions?.manage_members;}
function canFriendLock(ctx){return ctx.isHead||ctx.isGlobal||ctx.isRegionalForTarget||ctx.permissions?.manage_friend_requests||ctx.permissions?.manage_members;}

function modalMarkup(ctx){
  const roleTools=ctx.isHead?`<section class="ec-profile-admin-section"><h3>Rolle & Rechte <span>Nur Hauptadmin</span></h3><div class="ec-profile-admin-grid">${actionButton('Rolle entfernen → Mitglied','role:MEMBER')}${actionButton('Zum Supporter machen','role:SUPPORTER')}${actionButton('Zum Community Admin machen','role:ADMIN')}${actionButton(ctx.target.forum_moderator?'Forum-Moderator entfernen':'Forum-Moderator vergeben','forum-moderator')}${actionButton('Supporter + Forum-Moderation','supporter-forum-moderator')}</div></section>`:'';
  const headRights=ctx.isHead?`<section class="ec-profile-admin-section"><h3>Individuelle Rechte <span>Nur Hauptadmin</span></h3><div class="ec-profile-admin-permission-list">${Object.entries(USER_PERMISSION_LABELS).map(([key,label])=>`<label><input type="checkbox" data-head-user-permission="${key}" ${permissionChecked(ctx,key)}> ${esc(label)}</label>`).join('')}</div>${actionButton('Einzelrechte speichern','save-user-permissions')}</section>`:'';
  const regional=ctx.isHead&&ctx.regions?.length?`<section class="ec-profile-admin-section"><h3>Regionaladmin & Moderation <span>Nur Hauptadmin</span></h3><select data-head-region-select>${ctx.regions.map(r=>`<option value="${r.id}" data-slug="${esc(r.slug)}">${esc(r.name)}</option>`).join('')}</select><div data-regional-current></div><div class="ec-profile-admin-permission-list">${Object.entries(REGIONAL_PERMISSION_LABELS).map(([key,label])=>`<label><input type="checkbox" data-head-regional-permission="${key}"> ${esc(label)}</label>`).join('')}</div><div class="ec-profile-admin-grid">${actionButton('Regionaladmin vergeben / entfernen','toggle-regional-admin')}${actionButton('Regionale Moderationsrechte speichern','save-regional-moderation')}${actionButton('Regionale Moderation entfernen','remove-regional-moderation')}</div></section>`:'';
  const moderation=[canWarn(ctx)&&actionButton('Verwarnung senden','warn'),canSuspend(ctx)&&actionButton(ctx.target.account_status==='SUSPENDED'?'Konto freischalten':'Konto sperren','suspend',ctx.target.account_status==='SUSPENDED'?'success':'danger'),canForumLock(ctx)&&actionButton('Forum sperren / freigeben','feature:FORUM_POSTING'),canMessagingLock(ctx)&&actionButton('Nachrichten sperren / freigeben','feature:MESSAGING'),canFriendLock(ctx)&&actionButton('Freundschaftsanfragen sperren / freigeben','feature:FRIEND_REQUESTS')].filter(Boolean).join('');
  const points=canPoints(ctx)?`<section class="ec-profile-admin-section"><h3>Punkte</h3><div class="ec-profile-admin-summary"><span>Community-Punkte</span><strong>${Number(ctx.target.community_points||0).toLocaleString('de-AT')}</strong><span>Kaufpunkte</span><strong>${Number(ctx.target.purchase_points||0).toLocaleString('de-AT')}</strong></div><div class="ec-profile-admin-grid">${actionButton('Plus- oder Minuspunkte vergeben','points')}${actionButton('Punkteverlauf anzeigen','point-history')}</div></section>`:'';
  const headExtras=ctx.isHead?`<section class="ec-profile-admin-section"><h3>Hauptadmin-Werkzeuge</h3><div class="ec-profile-admin-grid">${actionButton(ctx.target.is_verified?'Verifizierung entfernen':'Profil verifizieren','verify')}${actionButton(ctx.target.account_badge==='BUSINESS'?'Unternehmenskonto entfernen':'Unternehmenskonto vergeben','business')}${actionButton(ctx.target.is_test_account?'Testkonto wieder sichtbar machen':'Als Testkonto ausblenden','test-account')}</div></section>`:'';
  return `<div class="ec-profile-admin-overlay ec-profile-admin-fallback-overlay" role="dialog" aria-modal="true" aria-label="Admin Tools"><div class="ec-profile-admin-modal"><header><div><span>ADMIN TOOLS</span><h2>${esc(targetName(ctx))}</h2><p>${esc(ROLE_LABELS[roleOf(ctx.target.role)]||roleOf(ctx.target.role))}</p></div><button type="button" class="ec-profile-admin-close" aria-label="Schließen">×</button></header><div class="ec-profile-admin-body">${roleTools}${headRights}${regional}${moderation?`<section class="ec-profile-admin-section"><h3>Mitglied moderieren</h3><div class="ec-profile-admin-grid">${moderation}</div></section>`:''}${points}${headExtras}</div></div></div>`;
}

function selectedRegion(ctx,modal){const select=modal.querySelector('[data-head-region-select]');return ctx.regions.find(r=>r.id===select?.value)||ctx.regions[0]||null;}
function syncRegionalControls(ctx,modal){const region=selectedRegion(ctx,modal);if(!region)return;const admin=regionalAdminActive(ctx,region.id),mod=regionalModRow(ctx,region.id),perms=new Set((mod?.permissions||[]).map(v=>String(v).toUpperCase()));const status=modal.querySelector('[data-regional-current]');if(status)status.innerHTML=`<p><strong>${esc(region.name)}</strong> · Regionaladmin: ${admin?'Ja':'Nein'} · Regionale Moderation: ${mod?'Ja':'Nein'}</p>`;modal.querySelectorAll('[data-head-regional-permission]').forEach(input=>{input.checked=perms.has(input.dataset.headRegionalPermission);});}
async function askReason(action){const value=window.prompt(`Begründung für „${action}“ (verpflichtend, mindestens 10 Zeichen):`,'');if(value===null)return null;const reason=value.trim();if(reason.length<10){window.alert('Bitte gib eine nachvollziehbare Begründung mit mindestens 10 Zeichen ein.');return null;}return reason;}
async function pointChange(ctx){const amount=Number(window.prompt('Punkteänderung: positive Zahl für Pluspunkte, negative Zahl für Minuspunkte (z. B. 5 oder -2):',''));if(!Number.isInteger(amount)||amount===0)return window.alert('Bitte eine ganze Zahl ungleich 0 eingeben.');const reason=await askReason(amount>0?'Pluspunkte vergeben':'Minuspunkte vergeben');if(!reason)return;const prepared=await preparePrivilegedAction(amount>0?'Pluspunkte vergeben':'Minuspunkte vergeben',ctx.target.id,reason);if(prepared?.error)return window.alert(prepared.error.message);const{error}=await supabase.rpc('award_member_points',{target_user:ctx.target.id,point_delta:amount,reason_text:reason,category_text:'ADMIN_ADJUSTMENT',notify_member:true});window.alert(error?error.message:'Punkte wurden aktualisiert.');}
async function showPointHistory(ctx,modal){const{data,error}=await supabase.from('point_transactions').select('created_at,amount,category,kind,reason').eq('member_id',ctx.target.id).order('created_at',{ascending:false}).limit(30);if(error)return window.alert(error.message);const body=modal.querySelector('.ec-profile-admin-body');const rows=(data||[]).map(row=>`<tr><td>${new Date(row.created_at).toLocaleString('de-AT')}</td><td>${Number(row.amount)>0?'+':''}${Number(row.amount)}</td><td>${esc(row.category||row.kind||'Punkte')}</td><td>${esc(row.reason||'')}</td></tr>`).join('');body.innerHTML=`<section class="ec-profile-admin-section"><button type="button" class="ec-profile-admin-back">← Zurück</button><h3>Punkteverlauf</h3><div class="ec-profile-admin-table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Punkte</th><th>Art</th><th>Grund</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Keine Einträge vorhanden.</td></tr>'}</tbody></table></div></section>`;body.querySelector('.ec-profile-admin-back').onclick=()=>openTools(ctx.target.id);}

async function saveUserPermissions(ctx,modal){
  if(!ctx.isHead)return;
  const values={};Object.keys(USER_PERMISSION_LABELS).forEach(key=>{values[key]=modal.querySelector(`[data-head-user-permission="${key}"]`)?.checked===true;});
  const{error}=await supabase.rpc('head_admin_set_user_permissions',{p_user_id:ctx.target.id,...Object.fromEntries(Object.entries(values).map(([k,v])=>[`p_${k}`,v]))});
  if(error)return window.alert(error.message);
  window.alert('Einzelrechte wurden gespeichert.');
  return openTools(ctx.target.id);
}

async function handleHeadRegional(ctx,action,modal){
  if(!ctx.isHead)return;const region=selectedRegion(ctx,modal);if(!region)return window.alert('Bitte eine Region auswählen.');
  if(action==='toggle-regional-admin'){const enabled=!regionalAdminActive(ctx,region.id);const{error}=await supabase.rpc('ec_set_regional_admin',{p_target:ctx.target.id,p_region_slug:region.slug,p_enabled:enabled});if(error)return window.alert(error.message);window.alert(enabled?`Regionaladmin für ${region.name} wurde vergeben.`:`Regionaladmin für ${region.name} wurde entfernt.`);return openTools(ctx.target.id);}
  if(action==='save-regional-moderation'){const permissions=[...modal.querySelectorAll('[data-head-regional-permission]:checked')].map(input=>input.dataset.headRegionalPermission);if(!permissions.length)return window.alert('Bitte mindestens ein regionales Moderationsrecht auswählen.');const{error}=await supabase.rpc('ec_set_regional_moderator',{p_target:ctx.target.id,p_region_slug:region.slug,p_permissions:permissions,p_enabled:true});if(error)return window.alert(error.message);window.alert(`Regionale Moderationsrechte für ${region.name} wurden gespeichert.`);return openTools(ctx.target.id);}
  if(action==='remove-regional-moderation'){const{error}=await supabase.rpc('ec_set_regional_moderator',{p_target:ctx.target.id,p_region_slug:region.slug,p_permissions:[],p_enabled:false});if(error)return window.alert(error.message);window.alert(`Regionale Moderation für ${region.name} wurde entfernt.`);return openTools(ctx.target.id);}
}

async function handleAction(ctx,action,modal){
  if(action.startsWith('role:')&&ctx.isHead){const newRole=action.split(':')[1];const{error}=await supabase.rpc('admin_set_role',{target_user:ctx.target.id,new_role:newRole});if(error)return window.alert(error.message);window.alert(newRole==='MEMBER'?'Rolle wurde entfernt.':'Rolle wurde geändert.');return openTools(ctx.target.id);}
  if(action==='forum-moderator'&&ctx.isHead){const{error}=await supabase.rpc('admin_set_forum_moderator',{p_target_user:ctx.target.id,p_enabled:!ctx.target.forum_moderator});if(error)return window.alert(error.message);window.alert('Forum-Moderationsrecht wurde aktualisiert.');return openTools(ctx.target.id);}
  if(action==='supporter-forum-moderator'&&ctx.isHead){let result=await supabase.rpc('admin_set_role',{target_user:ctx.target.id,new_role:'SUPPORTER'});if(result.error)return window.alert(result.error.message);result=await supabase.rpc('admin_set_forum_moderator',{p_target_user:ctx.target.id,p_enabled:true});if(result.error)return window.alert(result.error.message);window.alert('Supporter-Rolle und Forum-Moderationsrecht wurden vergeben.');return openTools(ctx.target.id);}
  if(action==='save-user-permissions')return saveUserPermissions(ctx,modal);
  if(['toggle-regional-admin','save-regional-moderation','remove-regional-moderation'].includes(action))return handleHeadRegional(ctx,action,modal);
  if(action==='warn'&&canWarn(ctx)){const warning=window.prompt('Text der Verwarnung:','Bitte beachte die Community-Regeln.');if(warning===null||warning.trim().length<10)return window.alert('Bitte einen Verwarnungstext mit mindestens 10 Zeichen eingeben.');const{error}=await supabase.rpc('admin_warn_user',{target_user:ctx.target.id,warning_text:warning.trim()});return window.alert(error?error.message:'Verwarnung wurde gesendet.');}
  if(action==='suspend'&&canSuspend(ctx)){const nextStatus=ctx.target.account_status==='SUSPENDED'?'ACTIVE':'SUSPENDED';const reason=await askReason(nextStatus==='SUSPENDED'?'Konto sperren':'Konto freischalten');if(!reason)return;const{error}=await supabase.rpc('admin_set_account_status',{target_user:ctx.target.id,new_status:nextStatus,p_reason:reason});if(error)return window.alert(error.message);window.alert(nextStatus==='SUSPENDED'?'Konto wurde gesperrt.':'Konto wurde freigeschaltet.');return openTools(ctx.target.id);}
  if(action.startsWith('feature:')){const feature=action.split(':')[1];const allowed=feature==='FORUM_POSTING'?canForumLock(ctx):feature==='MESSAGING'?canMessagingLock(ctx):canFriendLock(ctx);if(!allowed)return;const reason=await askReason(`${FEATURE_LABELS[feature]||feature} sperren / freigeben`);if(!reason)return;const{data:lock}=await supabase.from('user_feature_locks').select('is_locked').eq('user_id',ctx.target.id).eq('feature_key',feature).maybeSingle();const next=lock?.is_locked!==true;const{error}=await supabase.rpc('admin_set_feature_lock',{p_target_user:ctx.target.id,p_feature_key:feature,p_is_locked:next,p_reason:reason});if(error)return window.alert(error.message);window.alert(`${FEATURE_LABELS[feature]||feature} wurde ${next?'gesperrt':'freigegeben'}.`);return openTools(ctx.target.id);}
  if(action==='points'&&canPoints(ctx))return pointChange(ctx);
  if(action==='point-history'&&canPoints(ctx))return showPointHistory(ctx,modal);
  if(action==='verify'&&ctx.isHead){const{error}=await supabase.rpc('admin_set_profile_verification',{p_user_id:ctx.target.id,p_verified:!ctx.target.is_verified});if(error)return window.alert(error.message);window.alert('Verifizierung wurde aktualisiert.');return openTools(ctx.target.id);}
  if(action==='test-account'&&ctx.isHead){const{error}=await supabase.rpc('admin_set_test_account',{p_user_id:ctx.target.id,p_is_test:!ctx.target.is_test_account});if(error)return window.alert(error.message);window.alert('Testkonto-Status wurde aktualisiert.');return openTools(ctx.target.id);}
  if(action==='business'&&ctx.isHead){const enable=ctx.target.account_badge!=='BUSINESS';const company=enable?window.prompt('Firmen- oder Vereinsname:',targetName(ctx)):null;if(enable&&(!company||company.trim().length<2))return;const{error}=await supabase.rpc('admin_set_business_account',{p_user_id:ctx.target.id,p_enabled:enable,p_company_name:enable?company.trim():null,p_company_description:null});if(error)return window.alert(error.message);window.alert('Unternehmenskonto wurde aktualisiert.');return openTools(ctx.target.id);}
}

async function openTools(targetId){
  const ctx=await currentAccess(targetId);if(!ctx)return window.alert('Für dieses Profil stehen dir keine Admin Tools zur Verfügung.');document.querySelector('.ec-profile-admin-overlay')?.remove();document.body.insertAdjacentHTML('beforeend',modalMarkup(ctx));const modal=document.querySelector('.ec-profile-admin-fallback-overlay');if(!modal)return;modal.querySelector('.ec-profile-admin-close').onclick=()=>modal.remove();modal.onclick=(event)=>{if(event.target===modal)modal.remove();};modal.querySelector('[data-head-region-select]')?.addEventListener('change',()=>syncRegionalControls(ctx,modal));syncRegionalControls(ctx,modal);modal.querySelectorAll('[data-fallback-admin-action]').forEach(button=>{button.onclick=()=>handleAction(ctx,button.dataset.fallbackAdminAction,modal);});
}
window.ecOpenProfileAdminTools=openTools;

async function mountProfileButton(){
  if(mounting)return;const page=document.querySelector('.member-profile-page[data-profile-id]');if(!page)return;const targetId=page.dataset.profileId;const actions=page.querySelector('.member-profile-actions');if(!targetId||!actions)return;mounting=true;
  try{const ctx=await currentAccess(targetId);if(!page.isConnected)return;const existing=actions.querySelector('.ec-profile-admin-open');if(!ctx){existing?.remove();return;}removeLegacyProfileAdminButtons(page);if(existing?.dataset.profileAdminAuthority==='1')return;existing?.remove();const button=document.createElement('button');button.type='button';button.className='secondary-button ec-profile-admin-open';button.dataset.profileAdminAuthority='1';button.textContent='⚙ Admin Tools';button.onclick=()=>openTools(targetId);actions.prepend(button);}catch(error){console.error('Profil-Admin-Tools konnten nicht eingeblendet werden:',error);}finally{mounting=false;}
}

function scheduleMount(delay=40){clearTimeout(scheduled);scheduled=setTimeout(()=>void mountProfileButton(),delay);}
function scheduleMountAttempts(){mountTimers.forEach(timer=>clearTimeout(timer));mountTimers=[0,120,350,800,1400].map(delay=>setTimeout(()=>void mountProfileButton(),delay));}
window.addEventListener('ec:navigate',scheduleMountAttempts);
window.addEventListener('focus',()=>scheduleMount(20));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleMountAttempts,{once:true});else scheduleMountAttempts();
