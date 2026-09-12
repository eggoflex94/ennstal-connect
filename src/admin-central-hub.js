import { supabase } from './supabaseClient';

const svg = {
  admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6.5V12c0 4.7 3 7.4 7.5 9 4.5-1.6 7.5-4.3 7.5-9V6.5L12 3Z"/><path d="M9 12.2 11.1 14 15.5 9.7"/></svg>',
};

let access = null;
let loading = false;
let refreshTimer = null;
let mountTimers = [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function roleName(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'HEAD_ADMIN') return 'Hauptadmin';
  if (value === 'ADMIN') return 'Global Admin';
  if (value === 'SUPPORTER') return 'Supporter';
  return 'Moderation';
}

function rightsFor({ profile, permissions, regionalAdmin, regionalPermissions }) {
  const role = String(profile?.role || '').toUpperCase();
  const head = role === 'HEAD_ADMIN';
  const global = role === 'ADMIN';
  const p = permissions || {};
  const rp = new Set(regionalPermissions || []);
  const regional = Boolean(regionalAdmin);
  const has = (...keys) => keys.some((key) => rp.has(key));
  return {
    head,
    global,
    regional,
    forum: true,
    members: head || global || regional || !!p.manage_members || has('MEMBERS', 'MODERATION'),
    groups: head || global || regional || !!p.manage_groups || has('GROUPS'),
    news: head || global || regional || !!p.manage_news || has('NEWS', 'ANNOUNCEMENTS'),
    community: head || global || regional || !!p.manage_events || has('EVENTS', 'ANNOUNCEMENTS'),
    reports: head || global || !!p.manage_reports || has('REPORTS', 'MODERATION'),
    fullAdmin: head || global,
  };
}

async function loadAccess() {
  if (loading || !supabase) return access;
  loading = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { access = null; return null; }
    const { data: allowed, error: accessError } = await supabase.rpc('ec_has_admin_central_access');
    if (accessError || allowed !== true) { access = null; return null; }

    const [profileResult, permissionResult, regionalResult, moderationResult] = await Promise.all([
      supabase.from('profiles').select('id,nickname,role,account_status,forum_moderator').eq('id', user.id).maybeSingle(),
      supabase.from('user_permissions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id', user.id).eq('active', true),
    ]);

    const profile = profileResult.data;
    if (!profile || profile.account_status !== 'ACTIVE') { access = null; return null; }
    const regionalPermissions = (moderationResult.data || []).flatMap((row) => Array.isArray(row.permissions) ? row.permissions.map((x) => String(x).toUpperCase()) : []);
    access = {
      user,
      profile,
      permissions: permissionResult.data || {},
      regionalAdmin: Boolean((regionalResult.data || []).length),
      regionalPermissions,
    };
    access.rights = rightsFor(access);
    return access;
  } catch (error) {
    console.warn('Admin-Zentrale konnte nicht geprüft werden:', error);
    access = null;
    return null;
  } finally {
    loading = false;
  }
}

function grid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid') || document.querySelector('.ec-compact-menu-grid');
}

function removeCompetingAdminButtons(keep) {
  document.querySelectorAll('[data-regional-admin-tools-bridge="1"], [data-ec-admin-primary="1"][data-ec-page="admin"]').forEach((node) => {
    if (node !== keep) node.remove();
  });
}

async function ensureButton() {
  const ctx = access || await loadAccess();
  const menu = grid();
  if (!menu) return false;
  if (!ctx) {
    menu.querySelector('[data-ec-admin-central-hub="1"]')?.remove();
    return false;
  }

  let button = menu.querySelector('[data-ec-admin-central-hub="1"]') || menu.querySelector('[data-head-admin-tool="admin-tools"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
    menu.appendChild(button);
  }

  button.dataset.ecAdminCentralHub = '1';
  button.dataset.headAdminTool = 'admin-tools';
  button.dataset.ecCompactLabel = 'Admin-Zentrale';
  button.dataset.ecIconTone = 'admin';
  button.title = 'Admin-Zentrale';
  button.setAttribute('aria-label', 'Admin-Zentrale');

  if (button.dataset.ecAdminCentralReady !== '1') {
    button.innerHTML = `<span class="ec-compact-menu-icon">${svg.admin}</span><span class="ec-compact-menu-label">Admin-Zentrale</span>`;
    button.dataset.ecAdminCentralReady = '1';
  }

  button.onclick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.remove('ec-dock-open');
    await openHub();
  };
  removeCompetingAdminButtons(button);
  return true;
}

function tile(label, detail, action, icon, tone) {
  return `<button type="button" class="ec-admin-hub-tile" data-admin-hub-action="${escapeHtml(action)}" data-tone="${escapeHtml(tone)}"><span class="ec-admin-hub-tile-icon">${icon}</span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span></button>`;
}

const hubIcons = {
  forum: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>',
  members: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.7-3.5 2.8-5 6-5s5.3 1.5 6 5M14.5 15.5c3.4-.7 5.7.7 6.5 4.5"/></svg>',
  groups: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2.5 20c.7-3.5 2.5-5 5.5-5M21.5 20c-.7-3.5-2.5-5-5.5-5M8 20c.7-3.5 2-5 4-5s3.3 1.5 4 5"/></svg>',
  news: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  community: '<svg viewBox="0 0 24 24"><path d="M12 3 14.7 8.5 21 9.4l-4.5 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L3 9.4l6.3-.9L12 3Z"/></svg>',
  manage: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
};

async function openHub() {
  const ctx = await loadAccess();
  if (!ctx) return window.alert('Für dein Konto ist die Admin-Zentrale nicht freigeschaltet.');
  document.querySelector('.ec-admin-hub-overlay')?.remove();
  const r = ctx.rights;
  const tiles = [
    tile('Admin-Forum', 'Überregional für alle Admins und Moderatoren', 'admin-forum', hubIcons.forum, 'violet'),
    r.members && tile('Mitglieder', 'Mitglieder und freigegebene Moderationsfunktionen', 'members', hubIcons.members, 'blue'),
    r.groups && tile('Gruppen', 'Gruppenverwaltung nach deinen Rechten', 'groups', hubIcons.groups, 'teal'),
    r.news && tile('Neuigkeiten', 'Regionale Beiträge verwalten', 'news', hubIcons.news, 'orange'),
    r.community && tile('Community', 'Termine und Community-Bereiche', 'community', hubIcons.community, 'green'),
    r.fullAdmin && tile('Verwaltung', 'Erweiterte globale Admin-Verwaltung', 'admin', hubIcons.manage, 'red'),
    r.head && tile('Team-Aktivitäten', 'Alle privilegierten Aktionen kontrollieren', 'admin-log', hubIcons.activity, 'gold'),
  ].filter(Boolean).join('');

  document.body.insertAdjacentHTML('beforeend', `<div class="ec-admin-hub-overlay" role="dialog" aria-modal="true" aria-label="Admin-Zentrale"><section class="ec-admin-hub"><header><div><span>ADMIN-ZENTRALE</span><h2>${escapeHtml(roleName(ctx.profile.role))}</h2><p>Du siehst nur Bereiche, für die dein Konto freigeschaltet ist. Das Admin-Forum ist für das gesamte Admin- und Moderationsteam überregional.</p></div><button type="button" class="ec-admin-hub-close" aria-label="Schließen">×</button></header><div class="ec-admin-hub-grid">${tiles}</div><div class="ec-admin-hub-forum-host" hidden></div></section></div>`);
  const overlay = document.querySelector('.ec-admin-hub-overlay');
  overlay.querySelector('.ec-admin-hub-close').onclick = () => overlay.remove();
  overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
  overlay.querySelectorAll('[data-admin-hub-action]').forEach((button) => {
    button.onclick = async () => {
      const action = button.dataset.adminHubAction;
      if (action === 'admin-forum') return openAdminForum(overlay, ctx);
      overlay.remove();
      window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: action } }));
    };
  });
}

async function openAdminForum(overlay, ctx) {
  const host = overlay.querySelector('.ec-admin-hub-forum-host');
  const gridEl = overlay.querySelector('.ec-admin-hub-grid');
  gridEl.hidden = true;
  host.hidden = false;
  host.innerHTML = '<div class="ec-admin-forum-loading">Admin-Forum wird geladen …</div>';

  const { data: posts, error } = await supabase.from('forum_posts').select('id,author_id,title,content,created_at,edited_at').eq('scope', 'ADMIN').order('created_at', { ascending: false }).limit(100);
  if (error) { host.innerHTML = `<p class="ec-admin-forum-error">${escapeHtml(error.message)}</p>`; return; }
  const postIds = (posts || []).map((post) => post.id);
  const [{ data: replies }, { data: members }] = await Promise.all([
    postIds.length ? supabase.from('forum_replies').select('id,post_id,author_id,content,created_at').in('post_id', postIds).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id,nickname,role').eq('account_status', 'ACTIVE'),
  ]);
  const memberMap = new Map((members || []).map((member) => [member.id, member]));
  const nameFor = (id) => memberMap.get(id)?.nickname || 'Admin-Team';
  const roleFor = (id) => roleName(memberMap.get(id)?.role);

  const postHtml = (posts || []).map((post) => {
    const postReplies = (replies || []).filter((reply) => reply.post_id === post.id);
    return `<article class="ec-admin-forum-post"><div class="ec-admin-forum-meta"><strong>${escapeHtml(nameFor(post.author_id))}</strong><span>${escapeHtml(roleFor(post.author_id))} · ${new Date(post.created_at).toLocaleString('de-AT')}</span></div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.content)}</p><div class="ec-admin-forum-replies">${postReplies.map((reply) => `<div><strong>${escapeHtml(nameFor(reply.author_id))}</strong><span>${escapeHtml(reply.content)}</span><small>${new Date(reply.created_at).toLocaleString('de-AT')}</small></div>`).join('')}</div><form data-admin-reply-form="${post.id}"><textarea name="reply" minlength="2" required placeholder="Antwort schreiben …"></textarea><button type="submit">Antwort senden</button></form></article>`;
  }).join('');

  host.innerHTML = `<div class="ec-admin-forum-head"><button type="button" class="ec-admin-forum-back">← Zur Admin-Zentrale</button><div><span>INTERN · ÜBERREGIONAL</span><h2>Admin-Forum</h2><p>Gemeinsamer interner Austausch für alle Admins und berechtigten Moderatorinnen und Moderatoren.</p></div></div><form class="ec-admin-forum-create"><input name="title" minlength="3" required placeholder="Überschrift"><textarea name="content" minlength="3" required placeholder="Beitrag für das Admin-Team …"></textarea><button type="submit">Beitrag veröffentlichen</button></form><div class="ec-admin-forum-list">${postHtml || '<p class="ec-admin-forum-empty">Noch keine Beiträge vorhanden.</p>'}</div>`;
  host.querySelector('.ec-admin-forum-back').onclick = () => { host.hidden = true; gridEl.hidden = false; };
  host.querySelector('.ec-admin-forum-create').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const content = String(form.get('content') || '').trim();
    const regionId = document.querySelector('.ec-region-picker select')?.value || null;
    const { error: createError } = await supabase.rpc('ec_forum_create_regional_post', { p_scope: 'ADMIN', p_title: title, p_content: content, p_font_family: 'modern', p_font_size: 'normal', p_emphasis: 'normal', p_region: regionId && /^[0-9a-f-]{36}$/i.test(regionId) ? regionId : null });
    if (createError) return window.alert(createError.message);
    await openAdminForum(overlay, ctx);
  };
  host.querySelectorAll('[data-admin-reply-form]').forEach((form) => {
    form.onsubmit = async (event) => {
      event.preventDefault();
      const text = String(new FormData(form).get('reply') || '').trim();
      const { error: replyError } = await supabase.rpc('forum_create_reply', { p_post_id: form.dataset.adminReplyForm, p_content: text });
      if (replyError) return window.alert(replyError.message);
      await openAdminForum(overlay, ctx);
    };
  });
}

function clearMountTimers() {
  mountTimers.forEach((timer) => clearTimeout(timer));
  mountTimers = [];
}

function scheduleMountAttempts() {
  clearMountTimers();
  mountTimers = [0, 180, 550, 1200].map((delay) => setTimeout(() => void ensureButton(), delay));
}

function scheduleRefresh(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    access = null;
    await loadAccess();
    scheduleMountAttempts();
  }, delay);
}

window.addEventListener('focus', () => scheduleRefresh(30));
window.addEventListener('ec:navigate', scheduleMountAttempts);
window.addEventListener('ec:region-change', () => scheduleRefresh(30));
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT') {
    access = null;
    clearMountTimers();
    document.querySelector('[data-ec-admin-central-hub="1"]')?.remove();
    return;
  }
  scheduleRefresh(50);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleRefresh(0), { once: true });
else scheduleRefresh(0);
