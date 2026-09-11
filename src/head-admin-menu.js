import { supabase } from './supabaseClient';

const ADMIN_TOOL = ['admin-tools', 'Admin Tools', '<path d="M12 2.8 14 5l3-.2.8 2.9 2.5 1.7-1.1 2.8 1.1 2.8-2.5 1.7-.8 2.9-3-.2-2 2.2-2-2.2-3 .2-.8-2.9-2.5-1.7 1.1-2.8-1.1-2.8 2.5-1.7.8-2.9 3 .2Z"/><circle cx="12" cy="12" r="3.1"/>'];
const HEAD_TOOLS = [
  ['fake-accounts', 'Fake-Erkennung', '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>'],
  ['admin-log', 'Admin-Logbuch', '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h14M9 7h6M9 11h6"/>'],
  ['ads-manager', 'Werbung', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h6M17 13h.01"/>']
];

let access = { allowed: false, isHead: false };
let resolved = false;
let generation = 0;
let timer = null;
let menuRetry = null;
let rightsRetry = null;

function removeInjectedTools() {
  document.querySelectorAll('[data-head-admin-tool]').forEach((button) => button.remove());
}

function findGrid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid')
    || document.querySelector('.ec-compact-menu-grid');
}

function activeRegionSlug() {
  return document.querySelector('.ec-region-picker select')?.value
    || localStorage.getItem('ec-active-region')
    || '';
}

function scheduleMenuRetry() {
  clearTimeout(menuRetry);
  menuRetry = setTimeout(syncMenu, 140);
}

function visibleTools() {
  if (!access.allowed) return [];
  return access.isHead ? [ADMIN_TOOL, ...HEAD_TOOLS] : [ADMIN_TOOL];
}

function activateTool(page) {
  if (!access.allowed) return;
  document.body.classList.remove('ec-dock-open');
  if (page === 'admin-tools') {
    window.dispatchEvent(new CustomEvent('ec:open-admin-tools'));
    return;
  }
  if (!access.isHead) return;
  if (page === 'ads-manager') {
    window.dispatchEvent(new CustomEvent('ec:open-sidebar-ad-manager'));
    return;
  }
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
}

function syncMenu() {
  if (!resolved) return;
  const wanted = new Set(visibleTools().map(([page]) => page));
  document.querySelectorAll('[data-head-admin-tool]').forEach((button) => {
    if (!wanted.has(button.dataset.headAdminTool)) button.remove();
  });
  if (!access.allowed) return;

  const grid = findGrid();
  if (!grid) {
    scheduleMenuRetry();
    return;
  }

  for (const [page, label, icon] of visibleTools()) {
    let button = grid.querySelector(`[data-head-admin-tool="${page}"]`)
      || document.querySelector(`[data-head-admin-tool="${page}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
      button.dataset.headAdminTool = page;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<span class="ec-compact-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span class="ec-compact-menu-label">${label}</span>`;
      button.onclick = () => activateTool(page);
    }
    if (button.parentElement !== grid) grid.append(button);
  }
}

function scheduleRightsRetry() {
  clearTimeout(rightsRetry);
  rightsRetry = setTimeout(() => void refreshRights(), 450);
}

async function refreshRights({ clearOnMissingUser = false } = {}) {
  const request = ++generation;
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (request !== generation) return;
    if (userError || !user) {
      if (clearOnMissingUser && !user) {
        resolved = true;
        access = { allowed: false, isHead: false };
        syncMenu();
      }
      scheduleRightsRetry();
      return;
    }

    const [{ data: profile, error: profileError }, { data: regions, error: regionsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      supabase.from('profiles').select('role,account_status,home_region_id').eq('id', user.id).maybeSingle(),
      supabase.from('regions').select('id,slug').eq('is_active', true),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', user.id).eq('active', true)
    ]);

    if (request !== generation) return;
    if (profileError || regionsError || assignmentsError || !profile) {
      scheduleRightsRetry();
      return;
    }

    const role = String(profile.role || '').toUpperCase();
    const slug = activeRegionSlug();
    const activeRegionId = (regions || []).find((region) => region.slug === slug)?.id || profile.home_region_id || null;
    const hasRegionalAssignment = Boolean(activeRegionId && (assignments || []).some((assignment) => assignment.active && assignment.region_id === activeRegionId));
    const isActive = profile.account_status === 'ACTIVE';

    clearTimeout(rightsRetry);
    resolved = true;
    access = {
      allowed: isActive && (role === 'HEAD_ADMIN' || role === 'ADMIN' || hasRegionalAssignment),
      isHead: isActive && role === 'HEAD_ADMIN'
    };
    syncMenu();
  } catch {
    scheduleRightsRetry();
  }
}

let mutationQueued = false;
new MutationObserver(() => {
  if (mutationQueued) return;
  mutationQueued = true;
  requestAnimationFrame(() => {
    mutationQueued = false;
    syncMenu();
  });
}).observe(document.documentElement, { childList: true, subtree: true });

supabase.auth.onAuthStateChange((event) => {
  clearTimeout(timer);
  if (event === 'SIGNED_OUT') {
    generation++;
    clearTimeout(rightsRetry);
    resolved = true;
    access = { allowed: false, isHead: false };
    removeInjectedTools();
    return;
  }
  timer = setTimeout(() => void refreshRights(), 80);
});

window.addEventListener('focus', () => void refreshRights());
window.addEventListener('ec:navigate', syncMenu);
window.addEventListener('ec:region-change', () => setTimeout(() => void refreshRights(), 80));
void refreshRights({ clearOnMissingUser: true });
