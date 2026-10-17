import { supabase } from './supabaseClient';

const HEAD_TOOLS = [
  ['inactive-members', 'Inaktive Mitglieder', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ['account-approvals', 'Accounts freigeben', '<path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>'],
  ['fake-accounts', 'Fake-Erkennung', '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>'],
  ['admin-log', 'Team-Aktivitäten', '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h14M9 7h6M9 11h6"/>'],
  ['ads-manager', 'Werbung', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h6M17 13h.01"/>']
];

let isHead = false;
let canReviewAccounts = false;
let resolved = false;
let loading = false;
let retryTimers = [];

function findGrid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid') || document.querySelector('.ec-compact-menu-grid');
}

function removeHeadTools() {
  document.querySelectorAll('[data-head-admin-extra="1"]').forEach((node) => node.remove());
}

function activateTool(page) {
  document.body.classList.remove('ec-dock-open');
  if (page === 'inactive-members') {
    window.dispatchEvent(new CustomEvent('ec:open-inactive-members'));
    return;
  }
  if (page === 'ads-manager') {
    window.dispatchEvent(new CustomEvent('ec:open-sidebar-ad-manager'));
    return;
  }
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
}

function syncMenu() {
  if (!resolved) return false;
  if (!isHead && !canReviewAccounts) {
    removeHeadTools();
    return true;
  }
  const grid = findGrid();
  if (!grid) return false;

  for (const [page, label, icon] of HEAD_TOOLS) {
    if (!(page === 'account-approvals' ? canReviewAccounts : isHead)) {
      grid.querySelector(`[data-head-admin-extra="1"][data-head-admin-tool="${page}"]`)?.remove();
      continue;
    }
    let button = grid.querySelector(`[data-head-admin-extra="1"][data-head-admin-tool="${page}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
      button.dataset.headAdminExtra = '1';
      button.dataset.headAdminTool = page;
      button.dataset.ecCompactLabel = label;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<span class="ec-compact-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span class="ec-compact-menu-label">${label}</span>`;
      button.onclick = () => activateTool(page);
      grid.appendChild(button);
    }
  }
  return true;
}

function clearRetries() {
  retryTimers.forEach((timer) => clearTimeout(timer));
  retryTimers = [];
}

function scheduleMounts() {
  clearRetries();
  retryTimers = [0, 150, 450, 1000].map((delay) => setTimeout(() => {
    if (syncMenu()) clearRetries();
  }, delay));
}

async function refreshRights() {
  if (loading || !supabase) return;
  loading = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      isHead = false;
    canReviewAccounts = false;
      resolved = true;
      removeHeadTools();
      return;
    }
    const { data: profile, error } = await supabase.from('profiles').select('role,account_status,is_primary_head_admin').eq('id', user.id).maybeSingle();
    if (error) throw error;
    isHead = profile?.account_status === 'ACTIVE' && String(profile?.role || '').toUpperCase() === 'HEAD_ADMIN';
    const { data: reviewAllowed } = await supabase.rpc('ec_can_review_accounts');
    canReviewAccounts = reviewAllowed === true;
    resolved = true;
    scheduleMounts();
  } catch (error) {
    console.warn('Head-Admin-Menü konnte nicht geladen werden:', error?.message || error);
  } finally {
    loading = false;
  }
}

supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT') {
    isHead = false;
    canReviewAccounts = false;
    resolved = true;
    clearRetries();
    removeHeadTools();
    return;
  }
  setTimeout(() => void refreshRights(), 80);
});
window.addEventListener('ec:navigate', scheduleMounts);
window.addEventListener('ec:region-change', scheduleMounts);
window.addEventListener('focus', () => { scheduleMounts(); void refreshRights(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void refreshRights(), { once: true });
else void refreshRights();
