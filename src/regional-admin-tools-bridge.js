import { supabase } from './supabaseClient';

let allowed = false;
let currentUserId = '';
let assignments = [];
let regions = [];
let profile = null;
let refreshTimer = null;
let syncing = false;

function grid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid');
}

function activeRegion() {
  const datasetSlug = document.documentElement.dataset.ecRegion || '';
  const pickerSlug = document.querySelector('.ec-region-picker select')?.value || '';
  const visibleName = document.querySelector('.ec-active-region-name')?.textContent?.trim() || '';
  const storedSlug = localStorage.getItem('ec-active-region') || '';

  return regions.find((region) => datasetSlug && region.slug === datasetSlug)
    || regions.find((region) => pickerSlug && region.slug === pickerSlug)
    || regions.find((region) => visibleName && region.name === visibleName)
    || regions.find((region) => storedSlug && region.slug === storedSlug)
    || regions.find((region) => region.id === profile?.home_region_id)
    || null;
}

function isAssignedHere() {
  const region = activeRegion();
  return Boolean(region?.id && assignments.some((row) => row.active && row.region_id === region.id));
}

function removeButton() {
  document.querySelector('[data-regional-admin-tools-bridge="1"]')?.remove();
}

function ensureButton() {
  const menu = grid();
  if (!allowed || !menu) {
    if (!allowed) removeButton();
    return false;
  }

  if (menu.querySelector('[data-head-admin-tool="admin-tools"]')) {
    removeButton();
    return true;
  }

  let button = menu.querySelector('[data-regional-admin-tools-bridge="1"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
    button.dataset.regionalAdminToolsBridge = '1';
    button.title = 'Admin Tools';
    button.setAttribute('aria-label', 'Admin Tools');
    button.innerHTML = '<span class="ec-compact-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg></span><span class="ec-compact-menu-label">Admin Tools</span>';
    button.addEventListener('click', () => {
      if (!allowed) return;
      document.body.classList.remove('ec-dock-open');
      window.dispatchEvent(new CustomEvent('ec:open-admin-tools'));
    });
    menu.appendChild(button);
  }
  return true;
}

async function refreshAccess() {
  if (syncing) return;
  syncing = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id || '';
    if (!currentUserId) {
      allowed = false;
      removeButton();
      return;
    }

    const [{ data: nextProfile, error: profileError }, { data: nextRegions, error: regionError }, { data: nextAssignments, error: assignmentError }] = await Promise.all([
      supabase.from('profiles').select('role,account_status,home_region_id').eq('id', currentUserId).maybeSingle(),
      supabase.from('regions').select('id,slug,name').eq('is_active', true),
      supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', currentUserId).eq('active', true)
    ]);

    if (profileError || regionError || assignmentError || !nextProfile) return;
    profile = nextProfile;
    regions = nextRegions || [];
    assignments = nextAssignments || [];

    const role = String(profile.role || '').toUpperCase();
    const activeAccount = profile.account_status === 'ACTIVE';
    allowed = activeAccount && (role === 'HEAD_ADMIN' || role === 'ADMIN' || isAssignedHere());
    ensureButton();
  } finally {
    syncing = false;
  }
}

function scheduleRefresh(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshAccess(), delay);
}

new MutationObserver(() => {
  if (allowed) ensureButton();
}).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('ec:region-change', () => scheduleRefresh(60));
window.addEventListener('ec:navigate', () => {
  if (allowed) requestAnimationFrame(ensureButton);
});
window.addEventListener('focus', () => scheduleRefresh(30));
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    allowed = false;
    removeButton();
    return;
  }
  scheduleRefresh(50);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scheduleRefresh(0), { once: true });
} else {
  scheduleRefresh(0);
}
