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
  const isRegionalAdmin = adminAssignments.some(a => a.active !== false && a.region_id === region.id);
  if (isRegionalAdmin) return Object.keys(PERMISSION_TO_PAGE);
  const perms = new Set();
  moderationAssignments.filter(a => a.active !== false && a.region_id === region.id).forEach(a => (a.permissions || []).forEach(p => perms.add(String(p).toUpperCase())));
  return [...perms];
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
  button.title = `${label} verwalten`;
  button.setAttribute('aria-label', `${label} verwalten`);
  button.innerHTML = `<span class="ec-compact-menu-icon" aria-hidden="true">${icon}</span><span class="ec-compact-menu-label">${label}</span>`;
  let clicked = false;
  button.addEventListener('click', () => {
    if (clicked) return;
    clicked = true;
    button.disabled = true;
    document.body.classList.remove('ec-dock-open');
    window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
    setTimeout(() => { clicked = false; button.disabled = false; }, 700);
  });
  return button;
}

function renderIcons() {
  const grid = dockGrid();
  if (!grid) return;
  clearIcons();
  [...new Set(activePermissions())].forEach(permission => {
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

new MutationObserver(() => { if (dockGrid()) renderIcons(); }).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:region-change', () => schedule(30));
window.addEventListener('ec:navigate', () => setTimeout(renderIcons, 30));
window.addEventListener('focus', () => schedule(20));
document.addEventListener('change', event => { if (event.target?.matches?.('.ec-region-picker select')) schedule(20); });
supabase.auth.onAuthStateChange(event => event === 'SIGNED_OUT' ? clearIcons() : schedule(30));
schedule(0);

export {};
