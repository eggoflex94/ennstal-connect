import { preparePrivilegedAction, supabase } from './supabaseClient';

const PERMISSIONS = [
  ['manage_members','Mitglieder verwalten'],
  ['manage_points','Punkte verwalten'],
  ['manage_messages','Nachrichten verwalten'],
  ['manage_media','Medien verwalten'],
  ['manage_roles','Rollen verwalten'],
  ['manage_admins','Admins verwalten'],
  ['view_profile_visits','Profilbesuche sehen'],
  ['manage_news','Neuigkeiten verwalten'],
  ['manage_groups','Gruppen verwalten'],
  ['manage_events','Veranstaltungen verwalten'],
  ['manage_marketplace','Marktplatz verwalten'],
  ['manage_friend_requests','Freundschaftsanfragen verwalten'],
  ['manage_homepage','Startseite verwalten'],
  ['manage_reports','Meldungen verwalten']
];

let busy = false;
let lastProfileId = '';

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const role = (v) => String(v || 'MEMBER').toUpperCase();
const roleLabel = (v) => ({HEAD_ADMIN:'Hauptadmin',ADMIN:'Community Admin',SUPPORTER:'Supporter',MEMBER:'Mitglied'})[role(v)] || role(v);
const bool = (v) => v === true;

function notify(text) {
  window.alert(text);
}

async function askReason(action) {
  const reason = window.prompt(`Begründung für „${action}“ (verpflichtend, mindestens 10 Zeichen):`, '');
  if (reason === null) return null;
  if (reason.trim().length < 10) {
    notify('Bitte gib eine nachvollziehbare Begründung mit mindestens 10 Zeichen ein.');
    return null;
  }
  return reason.trim();
}

async function withPreparedAction(action, targetId, task) {
  const reason = await askReason(action);
  if (!reason) return false;
  const prepared = await preparePrivilegedAction(action, targetId, reason);
  if (prepared?.error) {
    notify(prepared.error.message || 'Die Aktion konnte nicht vorbereitet werden.');
    return false;
  }
  const result = await task(reason);
  if (result?.error) {
    notify(result.error.message || 'Die Aktion konnte nicht durchgeführt werden.');
    return false;
  }
  return true;
}

async function loadContext(targetId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || !targetId || user.id === targetId) return null;

  const [viewerResult,targetResult,permResult,regionsResult,regionalAdminResult,regionalModResult,targetRegionalAdminResult,targetRegionalModResult] = await Promise.all([
    supabase.from('profiles').select('id,nickname,role,account_status,forum_moderator,home_region_id').eq('id',user.id).maybeSingle(),
    supabase.from('profiles').select('id,nickname,first_name,last_name,role,account_status,forum_moderator,is_verified,is_test_account,account_badge,home_region_id,community_points,purchase_points').eq('id',targetId).maybeSingle(),
    supabase.from('user_permissions').select('*').eq('user_id',user.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active',true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',user.id).eq('active',true),
    supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',user.id).eq('active',true),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id',targetId).eq('active',true),
    supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id',targetId).eq('active',true)
  ]);

  const viewer = viewerResult.data;
  const target = targetResult.data;
  if (!viewer || !target || viewer.account_status !== 'ACTIVE') return null;
  const isHead = role(viewer.role) === 'HEAD_ADMIN';
  if (role(target.role) === 'HEAD_ADMIN' && !isHead) return null;
  const isGlobalAdmin = role(viewer.role) === 'ADMIN';
  const permissions = permResult.data || {};
  const regionalAdmins = regionalAdminResult.data || [];
  const regionalMods = regionalModResult.data || [];
  const moderationPermissions = new Set(regionalMods.flatMap(x => Array.isArray(x.permissions) ? x.permissions.map(y => String(y).toUpperCase()) : []));
  const hasRegionalAdmin = regionalAdmins.length > 0;
  const hasRegionalMod = regionalMods.length > 0;
  const isRegionalAdminForTarget = regionalAdmins.some(x => x.active !== false && x.region_id === target.home_region_id);
  const allowed = isHead || isGlobalAdmin || hasRegionalAdmin || hasRegionalMod || bool(viewer.forum_moderator) || PERMISSIONS.some(([key]) => bool(permissions[key]));
  if (!allowed) return null;
  return {
    viewer,target,isHead,isGlobalAdmin,isRegionalAdminForTarget,permissions,
    regions: regionsResult.data || [],
    regionalAdmins,regionalMods,moderationPermissions,
    targetRegionalAdmins: targetRegionalAdminResult.data || [],
    targetRegionalMods: targetRegionalModResult.data || []
  };
}

function can(ctx, permission) {
  return ctx.isHead || bool(ctx.permissions?.[permission]);
}

function isBaselineAdminForTarget(ctx) {
  return ctx.isHead || ctx.isGlobalAdmin || ctx.isRegionalAdminForTarget;
}

function canModerateMember(ctx) {
  return isBaselineAdminForTarget(ctx) || can(ctx,'manage_members') || bool(ctx.viewer.forum_moderator) || ctx.moderationPermissions.has('MODERATION') || ctx.moderationPermissions.has('REPORTS');
}

function targetName(target) {
  return target.nickname || [target.first_name,target.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function toolButton(label, action, cls = '') {
  return `<button type="button" class="ec-profile-admin-action ${cls}" data-admin-action="${esc(action)}">${esc(label)}</button>`;
}

function buildModal(ctx) {
  const target = ctx.target;
  const homeRegion = ctx.regions.find(r => r.id === target.home_region_id) || null;
  const isSuspended = target.account_status === 'SUSPENDED';
  const baselineAdmin = isBaselineAdminForTarget(ctx);
  const regionOptions = ctx.regions.map(r => `<option value="${esc(r.slug)}" ${r.id===target.home_region_id?'selected':''}>${esc(r.name)}</option>`).join('');
  const targetRegionalAdminIds = new Set(ctx.targetRegionalAdmins.map(x => x.region_id));
  const targetRegionalModIds = new Set(ctx.targetRegionalMods.map(x => x.region_id));

  const headRoleTools = ctx.isHead ? `
    <section class="ec-profile-admin-section">
      <h3>Rolle & Rechte <span>Nur Hauptadmin</span></h3>
      <p>Hauptrollen können ausschließlich vom Hauptadmin vergeben, gewechselt oder vollständig entfernt werden.</p>
      <div class="ec-profile-admin-grid">
        ${toolButton('Rolle entfernen → Mitglied','role:MEMBER')}
        ${toolButton('Zum Supporter machen','role:SUPPORTER')}
        ${toolButton('Zum Community Admin machen','role:ADMIN')}
        ${toolButton('Berechtigungen verwalten','permissions')}
        ${toolButton(target.forum_moderator ? 'Forum-Moderator entfernen' : 'Forum-Moderator vergeben','forum-moderator')}
      </div>
      <div class="ec-profile-admin-region-role">
        <label>Region für regionale Rolle<select class="ec-admin-region-select">${regionOptions}</select></label>
        <div class="ec-profile-admin-grid">
          ${toolButton(homeRegion && targetRegionalAdminIds.has(homeRegion.id) ? 'Regionaladmin entfernen' : 'Regionaladmin vergeben','regional-admin')}
          ${toolButton(homeRegion && targetRegionalModIds.has(homeRegion.id) ? 'Regionale Moderation entfernen' : 'Regionale Moderation vergeben','regional-moderator')}
        </div>
      </div>
    </section>` : '';

  const memberTools = canModerateMember(ctx) ? `
    <section class="ec-profile-admin-section">
      <h3>Mitglied moderieren</h3>
      ${baselineAdmin ? '<p class="ec-profile-admin-note">Diese Basisfunktionen stehen jedem Global- oder Regionaladmin in seinem Zuständigkeitsbereich zur Verfügung.</p>' : ''}
      <div class="ec-profile-admin-grid">
        ${toolButton('Verwarnung senden','warn')}
        ${baselineAdmin ? toolButton(isSuspended ? 'Konto freischalten' : 'Konto sperren','suspend',isSuspended?'success':'danger') : ''}
        ${baselineAdmin ? toolButton('Forum sperren / freigeben','feature:FORUM_POSTING') : ''}
        ${baselineAdmin ? toolButton('Nachrichten sperren / freigeben','feature:MESSAGING') : ''}
        ${baselineAdmin ? toolButton('Freundschaftsanfragen sperren / freigeben','feature:FRIEND_REQUESTS') : ''}
        ${can(ctx,'manage_reports') || ctx.isHead ? toolButton('Meldungen zum Mitglied','reports') : ''}
      </div>
    </section>` : '';

  const pointTools = baselineAdmin ? `
    <section class="ec-profile-admin-section">
      <h3>Punkte</h3>
      <div class="ec-profile-admin-summary"><span>Community-Punkte</span><strong>${Number(target.community_points || 0).toLocaleString('de-AT')}</strong><span>Kaufpunkte</span><strong>${Number(target.purchase_points || 0).toLocaleString('de-AT')}</strong></div>
      <div class="ec-profile-admin-grid">
        ${toolButton('Plus- oder Minuspunkte vergeben','points')}
        ${toolButton('Punkteverlauf anzeigen','point-history')}
      </div>
    </section>` : '';

  const headExtras = ctx.isHead ? `
    <section class="ec-profile-admin-section">
      <h3>Hauptadmin-Werkzeuge</h3>
      <div class="ec-profile-admin-grid">
        ${toolButton(target.is_verified ? 'Verifizierung entfernen' : 'Profil verifizieren','verify')}
        ${toolButton(target.account_badge === 'BUSINESS' ? 'Unternehmenskonto entfernen' : 'Unternehmenskonto vergeben','business')}
        ${toolButton(target.is_test_account ? 'Testkonto wieder sichtbar machen' : 'Als Testkonto ausblenden','test-account')}
      </div>
    </section>` : '';

  return `<div class="ec-profile-admin-overlay" role="dialog" aria-modal="true" aria-label="Admin Tools">
    <div class="ec-profile-admin-modal">
      <header><div><span>ADMIN TOOLS</span><h2>${esc(targetName(target))}</h2><p>${esc(roleLabel(target.role))}${homeRegion ? ` · ${esc(homeRegion.name)}` : ''}</p></div><button type="button" class="ec-profile-admin-close" aria-label="Schließen">×</button></header>
      <div class="ec-profile-admin-body">${headRoleTools}${memberTools}${pointTools}${headExtras || ''}${!headRoleTools&&!memberTools&&!pointTools&&!headExtras ? '<p class="ec-profile-admin-empty">Für dein Konto sind bei diesem Mitglied keine Profil-Adminfunktionen freigeschaltet.</p>' : ''}</div>
    </div>
  </div>`;
}

async function toggleFeature(targetId, feature) {
  const { data } = await supabase.from('user_feature_locks').select('is_locked').eq('user_id',targetId).eq('feature_key',feature).maybeSingle();
  const next = !bool(data?.is_locked);
  return withPreparedAction(`${feature} ${next ? 'sperren' : 'freigeben'}`,targetId,async reason =>
    supabase.rpc('admin_set_feature_lock',{p_target_user:targetId,p_feature_key:feature,p_is_locked:next,p_reason:reason})
  );
}

async function showPointHistory(ctx, modal) {
  const { data, error } = await supabase.from('point_transactions').select('created_at,amount,kind,category,reason').eq('member_id',ctx.target.id).order('created_at',{ascending:false}).limit(30);
  if (error) return notify(error.message);
  const rows = (data || []).map(x => `<tr><td>${new Date(x.created_at).toLocaleString('de-AT')}</td><td class="${Number(x.amount)<0?'minus':'plus'}">${Number(x.amount)>0?'+':''}${Number(x.amount)}</td><td>${esc(x.category || x.kind || 'Punkte')}</td><td>${esc(x.reason || 'Kein Grund gespeichert')}</td></tr>`).join('');
  const panel = modal.querySelector('.ec-profile-admin-body');
  panel.innerHTML = `<section class="ec-profile-admin-section"><button class="ec-profile-admin-back" type="button">← Zurück</button><h3>Punkteverlauf</h3><div class="ec-profile-admin-table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Punkte</th><th>Art</th><th>Grund</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Noch keine Einträge.</td></tr>'}</tbody></table></div></section>`;
  panel.querySelector('.ec-profile-admin-back').onclick = () => openTools(ctx.target.id,true);
}

async function managePermissions(ctx, modal) {
  const { data, error } = await supabase.rpc('admin_get_permissions',{target_user:ctx.target.id});
  if (error) return notify(error.message);
  const panel = modal.querySelector('.ec-profile-admin-body');
  panel.innerHTML = `<section class="ec-profile-admin-section"><button class="ec-profile-admin-back" type="button">← Zurück</button><h3>Berechtigungen für ${esc(targetName(ctx.target))}</h3><p>Zusatzrechte steuern zusätzliche Verwaltungsbereiche. Punkte, Verwarnungen, Kontosperren und Funktionssperren sind für Global- und Regionaladmins bereits Basisfunktionen.</p><div class="ec-profile-permission-list">${PERMISSIONS.map(([key,label])=>`<label><input type="checkbox" data-permission="${key}" ${data?.[key]?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div><button type="button" class="ec-profile-permissions-save">Berechtigungen speichern</button></section>`;
  panel.querySelector('.ec-profile-admin-back').onclick = () => openTools(ctx.target.id,true);
  panel.querySelector('.ec-profile-permissions-save').onclick = async () => {
    const values = Object.fromEntries(PERMISSIONS.map(([key]) => [key,!!panel.querySelector(`[data-permission="${key}"]`)?.checked]));
    const ok = await withPreparedAction('Berechtigungen ändern',ctx.target.id,() => supabase.rpc('admin_set_permissions',{
      target_user:ctx.target.id,
      p_manage_members:values.manage_members,p_manage_points:values.manage_points,p_manage_messages:values.manage_messages,p_manage_media:values.manage_media,p_manage_roles:values.manage_roles,p_manage_admins:values.manage_admins,p_view_profile_visits:values.view_profile_visits,p_manage_news:values.manage_news,p_manage_groups:values.manage_groups,p_manage_events:values.manage_events,p_manage_marketplace:values.manage_marketplace,p_manage_friend_requests:values.manage_friend_requests,p_manage_homepage:values.manage_homepage,p_manage_reports:values.manage_reports
    }));
    if (ok) { notify('Berechtigungen wurden gespeichert.'); openTools(ctx.target.id,true); }
  };
}

async function handleAction(ctx, action, modal) {
  if (action.startsWith('role:')) {
    if (!ctx.isHead) return;
    const nextRole = action.split(':')[1];
    const ok = await withPreparedAction(nextRole === 'MEMBER' ? 'Rolle entfernen' : `Rolle auf ${roleLabel(nextRole)} ändern`,ctx.target.id,() => supabase.rpc('admin_set_role',{target_user:ctx.target.id,new_role:nextRole}));
    if (ok) { notify(nextRole === 'MEMBER' ? 'Rolle wurde vollständig entfernt.' : `Rolle wurde auf ${roleLabel(nextRole)} geändert.`); window.location.reload(); }
    return;
  }
  if (action === 'permissions') return managePermissions(ctx,modal);
  if (action === 'forum-moderator' && ctx.isHead) {
    const enabled = !bool(ctx.target.forum_moderator);
    const ok = await withPreparedAction(`Forum-Moderation ${enabled?'vergeben':'entfernen'}`,ctx.target.id,() => supabase.rpc('admin_set_forum_moderator',{p_target_user:ctx.target.id,p_enabled:enabled}));
    if (ok) { notify('Forum-Moderationsrolle wurde aktualisiert.'); openTools(ctx.target.id,true); }
    return;
  }
  if ((action === 'regional-admin' || action === 'regional-moderator') && ctx.isHead) {
    const slug = modal.querySelector('.ec-admin-region-select')?.value;
    const region = ctx.regions.find(r => r.slug === slug);
    if (!region) return notify('Bitte eine Region auswählen.');
    if (action === 'regional-admin') {
      const enabled = !ctx.targetRegionalAdmins.some(x => x.region_id === region.id);
      const ok = await withPreparedAction(`Regionaladmin ${enabled?'vergeben':'entfernen'} – ${region.name}`,ctx.target.id,() => supabase.rpc('ec_set_regional_admin',{p_target:ctx.target.id,p_region_slug:region.slug,p_enabled:enabled}));
      if (ok) { notify('Regionale Adminrolle wurde aktualisiert.'); openTools(ctx.target.id,true); }
    } else {
      const enabled = !ctx.targetRegionalMods.some(x => x.region_id === region.id);
      const ok = await withPreparedAction(`Regionale Moderation ${enabled?'vergeben':'entfernen'} – ${region.name}`,ctx.target.id,() => supabase.rpc('ec_set_regional_moderator',{p_target:ctx.target.id,p_region_slug:region.slug,p_permissions:['FORUM','MODERATION','REPORTS'],p_enabled:enabled}));
      if (ok) { notify('Regionale Moderationsrolle wurde aktualisiert.'); openTools(ctx.target.id,true); }
    }
    return;
  }
  if (action === 'warn') {
    const text = window.prompt(`Verwarnung für ${targetName(ctx.target)}:`, 'Bitte beachte die Community-Regeln.');
    if (text === null || text.trim().length < 10) return notify('Bitte einen Verwarnungstext mit mindestens 10 Zeichen eingeben.');
    const reason = await askReason('Verwarnung aussprechen'); if (!reason) return;
    const prepared = await preparePrivilegedAction('Verwarnung aussprechen',ctx.target.id,reason); if (prepared?.error) return notify(prepared.error.message);
    const fn = isBaselineAdminForTarget(ctx) ? 'admin_warn_user' : 'forum_moderator_warn_user';
    const args = fn === 'forum_moderator_warn_user' ? {p_target_user:ctx.target.id,p_warning:text.trim()} : {target_user:ctx.target.id,warning_text:text.trim()};
    const { error } = await supabase.rpc(fn,args); return notify(error ? error.message : 'Verwarnung wurde gesendet.');
  }
  if (action === 'suspend') {
    if (!isBaselineAdminForTarget(ctx)) return notify('Diese Funktion steht nur Global- oder Regionaladmins im eigenen Zuständigkeitsbereich zur Verfügung.');
    const next = ctx.target.account_status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const ok = await withPreparedAction(next==='SUSPENDED'?'Konto sperren':'Konto freischalten',ctx.target.id,reason => supabase.rpc('admin_set_account_status',{target_user:ctx.target.id,new_status:next,p_reason:reason}));
    if (ok) { notify(next==='SUSPENDED'?'Konto wurde gesperrt.':'Konto wurde freigeschaltet.'); openTools(ctx.target.id,true); }
    return;
  }
  if (action.startsWith('feature:')) {
    if (!isBaselineAdminForTarget(ctx)) return notify('Diese Funktion steht nur Global- oder Regionaladmins im eigenen Zuständigkeitsbereich zur Verfügung.');
    return toggleFeature(ctx.target.id,action.split(':')[1]);
  }
  if (action === 'points') {
    if (!isBaselineAdminForTarget(ctx)) return notify('Punkte können nur Global- oder Regionaladmins im eigenen Zuständigkeitsbereich vergeben.');
    const amount = Number(window.prompt('Punkteänderung eingeben: positive Zahl für Pluspunkte, negative Zahl für Minuspunkte, z. B. 5 oder -2:', ''));
    if (!Number.isInteger(amount) || amount === 0) return notify('Bitte eine ganze Zahl ungleich 0 eingeben.');
    const reason = await askReason(amount > 0 ? 'Pluspunkte vergeben' : 'Minuspunkte vergeben'); if (!reason) return;
    const prepared = await preparePrivilegedAction(amount > 0 ? 'Pluspunkte vergeben' : 'Minuspunkte vergeben',ctx.target.id,reason); if (prepared?.error) return notify(prepared.error.message);
    const { error } = await supabase.rpc('award_member_points',{target_user:ctx.target.id,point_delta:amount,reason_text:reason,category_text:'ADMIN_ADJUSTMENT',notify_member:true});
    if (error) return notify(error.message); notify(amount > 0 ? 'Pluspunkte wurden vergeben.' : 'Minuspunkte wurden vergeben.'); return openTools(ctx.target.id,true);
  }
  if (action === 'point-history') return showPointHistory(ctx,modal);
  if (action === 'reports') { window.dispatchEvent(new CustomEvent('ec:navigate',{detail:{page:'reports',targetUserId:ctx.target.id}})); modal.remove(); return; }
  if (action === 'verify' && ctx.isHead) {
    const enabled = !bool(ctx.target.is_verified);
    const ok = await withPreparedAction(`Profilverifizierung ${enabled?'vergeben':'entfernen'}`,ctx.target.id,() => supabase.rpc('admin_set_profile_verification',{p_user_id:ctx.target.id,p_verified:enabled}));
    if (ok) { notify('Verifizierung wurde aktualisiert.'); openTools(ctx.target.id,true); }
    return;
  }
  if (action === 'test-account' && ctx.isHead) {
    const enabled = !bool(ctx.target.is_test_account);
    const ok = await withPreparedAction(`Testkonto ${enabled?'aktivieren':'deaktivieren'}`,ctx.target.id,() => supabase.rpc('admin_set_test_account',{p_user_id:ctx.target.id,p_is_test:enabled}));
    if (ok) { notify('Testkonto-Status wurde aktualisiert.'); openTools(ctx.target.id,true); }
    return;
  }
  if (action === 'business' && ctx.isHead) {
    const enabled = ctx.target.account_badge !== 'BUSINESS';
    let company = null;
    if (enabled) { company = window.prompt('Firmen- oder Vereinsname:', ''); if (company === null || company.trim().length < 2) return; }
    const ok = await withPreparedAction(`Unternehmenskonto ${enabled?'vergeben':'entfernen'}`,ctx.target.id,() => supabase.rpc('admin_set_business_account',{p_user_id:ctx.target.id,p_enabled:enabled,p_company_name:company?.trim()||null,p_company_description:null}));
    if (ok) { notify('Unternehmenskonto wurde aktualisiert.'); openTools(ctx.target.id,true); }
  }
}

async function openTools(targetId) {
  if (busy) return;
  busy = true;
  try {
    document.querySelector('.ec-profile-admin-overlay')?.remove();
    const ctx = await loadContext(targetId);
    if (!ctx) return notify('Für dieses Profil stehen dir keine Admin Tools zur Verfügung.');
    document.body.insertAdjacentHTML('beforeend',buildModal(ctx));
    const modal = document.querySelector('.ec-profile-admin-overlay');
    modal.querySelector('.ec-profile-admin-close').onclick = () => modal.remove();
    modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
    modal.querySelectorAll('[data-admin-action]').forEach(button => button.onclick = () => handleAction(ctx,button.dataset.adminAction,modal));
  } finally { busy = false; }
}

async function mount() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) return;
  const targetId = page.dataset.profileId;
  if (!targetId) return;
  if (page.dataset.unifiedAdminTools === '1' && lastProfileId === targetId) return;
  const ctx = await loadContext(targetId);
  if (!ctx || !page.isConnected) return;
  lastProfileId = targetId;
  page.dataset.unifiedAdminTools = '1';

  page.querySelector('.member-admin-tools')?.setAttribute('hidden','');
  page.querySelectorAll('button').forEach(button => {
    const t = String(button.textContent || '').trim().toLowerCase();
    if (/punkteliste|punkte vergeben/.test(t)) button.style.setProperty('display','none','important');
  });

  const actions = page.querySelector('.member-profile-actions');
  if (!actions || actions.querySelector('.ec-profile-admin-open')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button ec-profile-admin-open';
  button.textContent = '⚙ Admin Tools';
  button.onclick = () => openTools(targetId);
  actions.appendChild(button);
}

let mountTimer;
new MutationObserver(() => {
  clearTimeout(mountTimer);
  mountTimer = setTimeout(() => void mount(),80);
}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('ec:navigate',()=>setTimeout(()=>void mount(),80));
window.addEventListener('focus',()=>setTimeout(()=>void mount(),80));
void mount();
