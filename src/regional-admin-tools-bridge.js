import { supabase } from './supabaseClient';
import './profile-admin-tools-unified.css';
import './profile-admin-tools-unified.js';

let access = { allowed: false, isHead: false, isGlobalAdmin: false, isRegionalAdmin: false };
let currentUserId = '';
let assignments = [];
let regions = [];
let profile = null;
let refreshTimer = null;
let syncing = false;
let mountTimers = [];

function grid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid');
}

function selectedRegion() {
  const picker = document.querySelector('.ec-region-picker select');
  const pickerSlug = picker?.value || '';
  const visibleName = document.querySelector('.ec-active-region-name')?.textContent?.trim() || '';
  const storedSlug = localStorage.getItem('ec-active-region') || '';
  const datasetSlug = document.documentElement.dataset.ecRegion || '';

  return regions.find((region) => pickerSlug && region.slug === pickerSlug)
    || regions.find((region) => visibleName && region.name === visibleName)
    || regions.find((region) => storedSlug && region.slug === storedSlug)
    || regions.find((region) => datasetSlug && region.slug === datasetSlug)
    || regions.find((region) => region.id === profile?.home_region_id)
    || null;
}

function hasAssignmentForSelectedRegion() {
  const region = selectedRegion();
  if (!region?.id) return false;
  return assignments.some((row) => row.active !== false && row.region_id === region.id);
}

function removeBridgeButton() {
  document.querySelectorAll('[data-regional-admin-tools-bridge="1"]').forEach((node) => node.remove());
}

function createButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
  button.dataset.regionalAdminToolsBridge = '1';
  button.title = 'Admin Tools';
  button.setAttribute('aria-label', 'Admin Tools');
  button.innerHTML = '<span class="ec-compact-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg></span><span class="ec-compact-menu-label">Admin Tools</span>';
  button.addEventListener('click', () => {
    if (!access.allowed) return;
    document.body.classList.remove('ec-dock-open');
    window.dispatchEvent(new CustomEvent('ec:open-admin-tools'));
  });
  return button;
}

function ensureButton() {
  const menu = grid();
  if (!access.allowed || !menu) {
    if (!access.allowed) removeBridgeButton();
    return false;
  }

  // The shared Admin-Zentrale is authoritative when present.
  if (menu.querySelector('[data-ec-admin-central-hub="1"]')) {
    removeBridgeButton();
    return true;
  }

  const native = menu.querySelector('[data-head-admin-tool="admin-tools"]');
  if (native) {
    removeBridgeButton();
    return true;
  }

  let button = menu.querySelector('[data-regional-admin-tools-bridge="1"]');
  if (!button) {
    button = createButton();
    menu.appendChild(button);
  }
  return true;
}

function computeAccess() {
  const role = String(profile?.role || '').toUpperCase();
  const activeAccount = profile?.account_status === 'ACTIVE';
  const isHead = activeAccount && role === 'HEAD_ADMIN';
  const isGlobalAdmin = activeAccount && role === 'ADMIN';
  const isRegionalAdmin = activeAccount && hasAssignmentForSelectedRegion();
  access = {
    allowed: Boolean(isHead || isGlobalAdmin || isRegionalAdmin),
    isHead,
    isGlobalAdmin,
    isRegionalAdmin,
  };
  const dock = document.querySelector('.ec-right-dock');
  if (dock) {
    dock.dataset.ecRegionalAdminAccess = access.isRegionalAdmin ? '1' : '0';
    dock.dataset.ecAdminToolsAccess = access.allowed ? '1' : '0';
  }
}

async function refreshAccess() {
  if (syncing) return;
  syncing = true;
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    currentUserId = user?.id || '';
    if (authError || !currentUserId) {
      access = { allowed: false, isHead: false, isGlobalAdmin: false, isRegionalAdmin: false };
      removeBridgeButton();
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
    computeAccess();
    ensureButton();
  } finally {
    syncing = false;
  }
}

function lightweightSync() {
  if (!profile || !regions.length) {
    void refreshAccess();
    return;
  }
  computeAccess();
  ensureButton();
}

function scheduleRefresh(delay = 50) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshAccess(), delay);
}

function scheduleMountAttempts() {
  mountTimers.forEach((timer) => clearTimeout(timer));
  mountTimers = [0, 180, 550, 1200].map((delay) => setTimeout(lightweightSync, delay));
}

window.addEventListener('ec:region-change', () => {
  lightweightSync();
  scheduleRefresh(40);
  scheduleMountAttempts();
});
window.addEventListener('ec:navigate', scheduleMountAttempts);
window.addEventListener('focus', () => scheduleRefresh(20));
document.addEventListener('change', (event) => {
  if (event.target?.matches?.('.ec-region-picker select')) {
    setTimeout(lightweightSync, 0);
    scheduleRefresh(40);
  }
});
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentUserId = '';
    profile = null;
    assignments = [];
    access = { allowed: false, isHead: false, isGlobalAdmin: false, isRegionalAdmin: false };
    mountTimers.forEach((timer) => clearTimeout(timer));
    mountTimers = [];
    removeBridgeButton();
    return;
  }
  scheduleRefresh(30);
  scheduleMountAttempts();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    scheduleRefresh(0);
    scheduleMountAttempts();
  }, { once: true });
} else {
  scheduleRefresh(0);
  scheduleMountAttempts();
}
