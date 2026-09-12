import { preparePrivilegedAction, supabase } from './supabaseClient';

const ROLE_LABELS = { HEAD_ADMIN: 'Hauptadmin', ADMIN: 'Community Admin', SUPPORTER: 'Supporter', MEMBER: 'Mitglied' };
const featureLabels = {
  FORUM_POSTING: 'Forum',
  MESSAGING: 'Nachrichten',
  FRIEND_REQUESTS: 'Freundschaftsanfragen'
};

let mounting = false;
let scheduled = null;

const roleOf = (value) => String(value || 'MEMBER').toUpperCase();
const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

async function currentAccess(targetId) {
  if (!supabase || !targetId) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId) return null;

  const [{ data: viewer }, { data: target }, { data: regional }, { data: permissions }] = await Promise.all([
    supabase.from('profiles').select('id,role,account_status,forum_moderator').eq('id', user.id).maybeSingle(),
    supabase.from('profiles').select('id,nickname,first_name,last_name,role,account_status,home_region_id,community_points,purchase_points,forum_moderator,is_verified,is_test_account,account_badge').eq('id', targetId).maybeSingle(),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true),
    supabase.from('user_permissions').select('*').eq('user_id', user.id).maybeSingle()
  ]);

  if (!viewer || viewer.account_status !== 'ACTIVE') return null;
  const viewerRole = roleOf(viewer.role);
  const targetRole = roleOf(target?.role);
  const isHead = viewerRole === 'HEAD_ADMIN';
  const isGlobal = viewerRole === 'ADMIN';
  if (targetRole === 'HEAD_ADMIN' && !isHead) return null;

  const regionRows = regional || [];
  const isRegionalForTarget = Boolean(target?.home_region_id && regionRows.some((row) => row.active !== false && row.region_id === target.home_region_id));
  const p = permissions || {};
  const hasGrantedTools = Boolean(viewer.forum_moderator || p.manage_members || p.manage_points || p.manage_reports || p.manage_messages || p.manage_media);
  const allowed = isHead || isGlobal || isRegionalForTarget || hasGrantedTools;
  if (!allowed) return null;

  return { user, viewer, target: target || { id: targetId }, isHead, isGlobal, isRegionalForTarget, permissions: p };
}

function removeLegacyProfileAdminButtons(page) {
  page.querySelector('.member-admin-tools')?.setAttribute('hidden', '');
  page.querySelectorAll('button').forEach((button) => {
    const text = String(button.textContent || '').trim().toLowerCase();
    if (/punkteliste|punkte vergeben/.test(text)) button.style.setProperty('display', 'none', 'important');
  });
}

function targetName(ctx) {
  return ctx.target?.nickname || [ctx.target?.first_name, ctx.target?.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function actionButton(label, action, klass = '') {
  return `<button type="button" class="ec-profile-admin-action ${klass}" data-fallback-admin-action="${esc(action)}">${esc(label)}</button>`;
}

function modalMarkup(ctx) {
  const suspended = ctx.target?.account_status === 'SUSPENDED';
  const baseline = ctx.isHead || ctx.isGlobal || ctx.isRegionalForTarget;
  const roleTools = ctx.isHead ? `
    <section class="ec-profile-admin-section">
      <h3>Rolle & Rechte <span>Nur Hauptadmin</span></h3>
      <p>Du kannst die Hauptrolle vollständig entfernen oder neu vergeben.</p>
      <div class="ec-profile-admin-grid">
        ${actionButton('Rolle entfernen → Mitglied', 'role:MEMBER')}
        ${actionButton('Zum Supporter machen', 'role:SUPPORTER')}
        ${actionButton('Zum Community Admin machen', 'role:ADMIN')}
        ${actionButton(ctx.target?.forum_moderator ? 'Forum-Moderator entfernen' : 'Forum-Moderator vergeben', 'forum-moderator')}
        ${actionButton('Berechtigungen im Adminbereich verwalten', 'permissions')}
      </div>
    </section>` : '';

  const moderationTools = baseline ? `
    <section class="ec-profile-admin-section">
      <h3>Mitglied moderieren</h3>
      <div class="ec-profile-admin-grid">
        ${actionButton('Verwarnung senden', 'warn')}
        ${actionButton(suspended ? 'Konto freischalten' : 'Konto sperren', 'suspend', suspended ? 'success' : 'danger')}
        ${actionButton('Forum sperren / freigeben', 'feature:FORUM_POSTING')}
        ${actionButton('Nachrichten sperren / freigeben', 'feature:MESSAGING')}
        ${actionButton('Freundschaftsanfragen sperren / freigeben', 'feature:FRIEND_REQUESTS')}
      </div>
    </section>
    <section class="ec-profile-admin-section">
      <h3>Punkte</h3>
      <div class="ec-profile-admin-summary"><span>Community-Punkte</span><strong>${Number(ctx.target?.community_points || 0).toLocaleString('de-AT')}</strong><span>Kaufpunkte</span><strong>${Number(ctx.target?.purchase_points || 0).toLocaleString('de-AT')}</strong></div>
      <div class="ec-profile-admin-grid">
        ${actionButton('Plus- oder Minuspunkte vergeben', 'points')}
        ${actionButton('Punkteverlauf anzeigen', 'point-history')}
      </div>
    </section>` : '';

  const headExtras = ctx.isHead ? `
    <section class="ec-profile-admin-section">
      <h3>Hauptadmin-Werkzeuge</h3>
      <div class="ec-profile-admin-grid">
        ${actionButton(ctx.target?.is_verified ? 'Verifizierung entfernen' : 'Profil verifizieren', 'verify')}
        ${actionButton(ctx.target?.account_badge === 'BUSINESS' ? 'Unternehmenskonto entfernen' : 'Unternehmenskonto vergeben', 'business')}
        ${actionButton(ctx.target?.is_test_account ? 'Testkonto wieder sichtbar machen' : 'Als Testkonto ausblenden', 'test-account')}
      </div>
    </section>` : '';

  return `<div class="ec-profile-admin-overlay ec-profile-admin-fallback-overlay" role="dialog" aria-modal="true" aria-label="Admin Tools">
    <div class="ec-profile-admin-modal">
      <header><div><span>ADMIN TOOLS</span><h2>${esc(targetName(ctx))}</h2><p>${esc(ROLE_LABELS[roleOf(ctx.target?.role)] || roleOf(ctx.target?.role))}</p></div><button type="button" class="ec-profile-admin-close" aria-label="Schließen">×</button></header>
      <div class="ec-profile-admin-body">${roleTools}${moderationTools}${headExtras}</div>
    </div>
  </div>`;
}

async function askReason(action) {
  const value = window.prompt(`Begründung für „${action}“ (verpflichtend, mindestens 10 Zeichen):`, '');
  if (value === null) return null;
  const reason = value.trim();
  if (reason.length < 10) {
    window.alert('Bitte gib eine nachvollziehbare Begründung mit mindestens 10 Zeichen ein.');
    return null;
  }
  return reason;
}

async function pointChange(ctx) {
  const amount = Number(window.prompt('Punkteänderung: positive Zahl für Pluspunkte, negative Zahl für Minuspunkte (z. B. 5 oder -2):', ''));
  if (!Number.isInteger(amount) || amount === 0) return window.alert('Bitte eine ganze Zahl ungleich 0 eingeben.');
  const reason = await askReason(amount > 0 ? 'Pluspunkte vergeben' : 'Minuspunkte vergeben');
  if (!reason) return;
  const prepared = await preparePrivilegedAction(amount > 0 ? 'Pluspunkte vergeben' : 'Minuspunkte vergeben', ctx.target.id, reason);
  if (prepared?.error) return window.alert(prepared.error.message);
  const { error } = await supabase.rpc('award_member_points', { target_user: ctx.target.id, point_delta: amount, reason_text: reason, category_text: 'ADMIN_ADJUSTMENT', notify_member: true });
  window.alert(error ? error.message : 'Punkte wurden aktualisiert.');
}

async function showPointHistory(ctx, modal) {
  const { data, error } = await supabase.from('point_transactions').select('created_at,amount,category,kind,reason').eq('member_id', ctx.target.id).order('created_at', { ascending: false }).limit(30);
  if (error) return window.alert(error.message);
  const body = modal.querySelector('.ec-profile-admin-body');
  const rows = (data || []).map((row) => `<tr><td>${new Date(row.created_at).toLocaleString('de-AT')}</td><td>${Number(row.amount) > 0 ? '+' : ''}${Number(row.amount)}</td><td>${esc(row.category || row.kind || 'Punkte')}</td><td>${esc(row.reason || '')}</td></tr>`).join('');
  body.innerHTML = `<section class="ec-profile-admin-section"><button type="button" class="ec-profile-admin-back">← Zurück</button><h3>Punkteverlauf</h3><div class="ec-profile-admin-table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Punkte</th><th>Art</th><th>Grund</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Keine Einträge vorhanden.</td></tr>'}</tbody></table></div></section>`;
  body.querySelector('.ec-profile-admin-back').onclick = () => openTools(ctx.target.id);
}

async function handleAction(ctx, action, modal) {
  if (action.startsWith('role:') && ctx.isHead) {
    const newRole = action.split(':')[1];
    const { error } = await supabase.rpc('admin_set_role', { target_user: ctx.target.id, new_role: newRole });
    if (error) return window.alert(error.message);
    window.alert(newRole === 'MEMBER' ? 'Rolle wurde entfernt.' : 'Rolle wurde geändert.');
    return window.location.reload();
  }
  if (action === 'forum-moderator' && ctx.isHead) {
    const { error } = await supabase.rpc('admin_set_forum_moderator', { p_target_user: ctx.target.id, p_enabled: !ctx.target?.forum_moderator });
    if (error) return window.alert(error.message);
    window.alert('Forum-Moderation wurde aktualisiert.');
    return openTools(ctx.target.id);
  }
  if (action === 'permissions' && ctx.isHead) {
    modal.remove();
    window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'admin' } }));
    return;
  }
  if (action === 'warn') {
    const warning = window.prompt('Text der Verwarnung:', 'Bitte beachte die Community-Regeln.');
    if (warning === null || warning.trim().length < 10) return window.alert('Bitte einen Verwarnungstext mit mindestens 10 Zeichen eingeben.');
    const { error } = await supabase.rpc('admin_warn_user', { target_user: ctx.target.id, warning_text: warning.trim() });
    return window.alert(error ? error.message : 'Verwarnung wurde gesendet.');
  }
  if (action === 'suspend') {
    const nextStatus = ctx.target?.account_status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    const { error } = await supabase.rpc('admin_set_account_status', { target_user: ctx.target.id, new_status: nextStatus, p_reason: null });
    if (error) return window.alert(error.message);
    window.alert(nextStatus === 'SUSPENDED' ? 'Konto wurde gesperrt.' : 'Konto wurde freigeschaltet.');
    return openTools(ctx.target.id);
  }
  if (action.startsWith('feature:')) {
    const feature = action.split(':')[1];
    const { data: lock } = await supabase.from('user_feature_locks').select('is_locked').eq('user_id', ctx.target.id).eq('feature_key', feature).maybeSingle();
    const next = lock?.is_locked !== true;
    const { error } = await supabase.rpc('admin_set_feature_lock', { p_target_user: ctx.target.id, p_feature_key: feature, p_is_locked: next, p_reason: null });
    if (error) return window.alert(error.message);
    window.alert(`${featureLabels[feature] || feature} wurde ${next ? 'gesperrt' : 'freigegeben'}.`);
    return openTools(ctx.target.id);
  }
  if (action === 'points') return pointChange(ctx);
  if (action === 'point-history') return showPointHistory(ctx, modal);
  if (action === 'verify' && ctx.isHead) {
    const { error } = await supabase.rpc('admin_set_profile_verification', { p_user_id: ctx.target.id, p_verified: !ctx.target?.is_verified });
    if (error) return window.alert(error.message);
    window.alert('Verifizierung wurde aktualisiert.');
    return openTools(ctx.target.id);
  }
  if (action === 'test-account' && ctx.isHead) {
    const { error } = await supabase.rpc('admin_set_test_account', { p_user_id: ctx.target.id, p_is_test: !ctx.target?.is_test_account });
    if (error) return window.alert(error.message);
    window.alert('Testkonto-Status wurde aktualisiert.');
    return openTools(ctx.target.id);
  }
  if (action === 'business' && ctx.isHead) {
    const enable = ctx.target?.account_badge !== 'BUSINESS';
    const company = enable ? window.prompt('Firmen- oder Vereinsname:', targetName(ctx)) : null;
    if (enable && (!company || company.trim().length < 2)) return;
    const { error } = await supabase.rpc('admin_set_business_account', { p_user_id: ctx.target.id, p_enabled: enable, p_company_name: enable ? company.trim() : null, p_company_description: null });
    if (error) return window.alert(error.message);
    window.alert('Unternehmenskonto wurde aktualisiert.');
    return openTools(ctx.target.id);
  }
}

async function openTools(targetId) {
  const ctx = await currentAccess(targetId);
  if (!ctx) return window.alert('Für dieses Profil stehen dir keine Admin Tools zur Verfügung.');
  document.querySelector('.ec-profile-admin-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', modalMarkup(ctx));
  const modal = document.querySelector('.ec-profile-admin-fallback-overlay');
  if (!modal) return;
  modal.querySelector('.ec-profile-admin-close').onclick = () => modal.remove();
  modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
  modal.querySelectorAll('[data-fallback-admin-action]').forEach((button) => {
    button.onclick = () => handleAction(ctx, button.dataset.fallbackAdminAction, modal);
  });
}

async function mountProfileButton() {
  if (mounting) return;
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) return;
  const targetId = page.dataset.profileId;
  const actions = page.querySelector('.member-profile-actions');
  if (!targetId || !actions) return;
  if (actions.querySelector('.ec-profile-admin-open')) return;

  mounting = true;
  try {
    const ctx = await currentAccess(targetId);
    if (!ctx || !page.isConnected) return;
    removeLegacyProfileAdminButtons(page);
    if (actions.querySelector('.ec-profile-admin-open')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button ec-profile-admin-open';
    button.textContent = '⚙ Admin Tools';
    button.onclick = () => openTools(targetId);
    actions.prepend(button);
  } catch (error) {
    console.error('Profil-Admin-Tools konnten nicht eingeblendet werden:', error);
  } finally {
    mounting = false;
  }
}

function scheduleMount(delay = 40) {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => void mountProfileButton(), delay);
}

new MutationObserver(() => scheduleMount(20)).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', () => scheduleMount(20));
window.addEventListener('focus', () => scheduleMount(20));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleMount(0), { once: true });
else scheduleMount(0);
