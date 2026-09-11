import { supabase } from './supabaseClient';

const PERMISSION_TO_PAGE = {
  NEWS: ['news', 'Neuigkeiten', '📰'],
  EVENTS: ['events', 'Veranstaltungen', '📅'],
  HOMEPAGE: ['home', 'Startseite', '🏠'],
  GROUPS: ['groups', 'Gruppen', '👥'],
  FORUM: ['forum', 'Forum', '💬'],
  MEMBERS: ['members', 'Mitglieder', '🧑‍🤝‍🧑'],
  BUSINESS: ['members', 'Unternehmen', '🏢'],
  ANNOUNCEMENTS: ['news', 'Ankündigungen', '📣']
};

let userId = '';
let profile = null;
let regions = [];
let adminAssignments = [];
let moderationAssignments = [];
let refreshTimer = null;
let busy = false;

function dockGrid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid') || document.querySelector('.ec-compact-menu-grid');
}

function selectedRegion() {
  const slug = document.querySelector('.ec-region-picker select')?.value || localStorage.getItem('ec-active-region') || document.documentElement.dataset.ecRegion || '';
  const visible = document.querySelector('.ec-active-region-name')?.textContent?.trim() || '';
  return regions.find(r => r.slug === slug) || regions.find(r => r.name === visible) || regions.find(r => r.id === profile?.home_region_id) || null;
}

function clearIcons() {
  document.querySelectorAll('[data-regional-right-icon="1"]').forEach(node => node.remove());
}

function activePermissions() {
  const region = selectedRegion();
  if (!region?.id || !profile || profile.account_status !== 'ACTIVE') return [];
  const role = String(profile.role || '').toUpperCase();
  if (role === 'HEAD_ADMIN' || role === 'ADMIN') return [];

  const hasRegionalAdminAssignment = adminAssignments.some(a => a.active !== false && a.region_id === region.id);
  const regionalRows = moderationAssignments.filter(a => a.active !== false && a.region_id === region.id);
  const explicit = new Set();
  regionalRows.forEach(a => (a.permissions || []).forEach(p => explicit.add(String(p).toUpperCase())));
  if (!hasRegionalAdminAssignment && !regionalRows.length) return [];
  return [...explicit].filter(permission => PERMISSION_TO_PAGE[permission]);
}

function makeIcon(permission) {
  const spec = PERMISSION_TO_PAGE[permission];
  if (!spec) return null;
  const [page, label, icon] = spec;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ec-compact-menu-item ec-dashboard-utility-button ec-regional-right-button';
  button.dataset.regionalRightIcon = '1';
  button.dataset.permission = permission;
  button.dataset.ecPage = page;
  button.title = `${label} verwalten`;
  button.setAttribute('aria-label', `${label} verwalten`);
  button.innerHTML = `<span class="ec-compact-menu-icon" aria-hidden="true">${icon}</span><span class="ec-compact-menu-label">${label}</span>`;
  return button;
}

function renderIcons() {
  const grid = dockGrid();
  if (!grid) return;
  const wanted = [...new Set(activePermissions())];
  const current = [...document.querySelectorAll('[data-regional-right-icon="1"]')];
  const currentKeys = current.map(node => node.dataset.permission).filter(Boolean);
  if (wanted.length === currentKeys.length && wanted.every(key => currentKeys.includes(key))) return;
  clearIcons();
  wanted.forEach(permission => {
    const button = makeIcon(permission);
    if (button) grid.appendChild(button);
  });
}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const { data: auth } = await supabase.auth.getUser();
    userId = auth?.user?.id || '';
    if (!userId) { clearIcons(); return; }
    const [p, r, a, m] = await Promise.all([
      supabase.from('profiles').select('role,account_status,home_region_id').eq('id', userId).maybeSingle(),
      supabase.from('regions').select('id,slug,name').eq('is_active', true),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', userId).eq('active', true),
      supabase.from('regional_moderation_assignments').select('region_id,permissions,active').eq('user_id', userId).eq('active', true)
    ]);
    if (p.error || r.error || a.error || m.error) return;
    profile = p.data;
    regions = r.data || [];
    adminAssignments = a.data || [];
    moderationAssignments = m.data || [];
    renderIcons();
  } finally { busy = false; }
}

function schedule(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), delay);
}

let mutationQueued = false;
new MutationObserver(() => {
  if (mutationQueued || !dockGrid()) return;
  mutationQueued = true;
  requestAnimationFrame(() => {
    mutationQueued = false;
    renderIcons();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('ec:region-change', () => schedule(20));
window.addEventListener('ec:navigate', () => setTimeout(renderIcons, 20));
window.addEventListener('focus', () => schedule(20));
document.addEventListener('change', event => { if (event.target?.matches?.('.ec-region-picker select')) schedule(20); });
supabase.auth.onAuthStateChange(event => event === 'SIGNED_OUT' ? clearIcons() : schedule(20));
schedule(0);

export {};
