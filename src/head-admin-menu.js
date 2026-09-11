import { supabase } from './supabaseClient';

const tools = [
  ['fake-accounts', 'Fake-Erkennung', '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>'],
  ['admin-log', 'Admin-Logbuch', '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h14M9 7h6M9 11h6"/>'],
  ['ads-manager', 'Werbung', '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h6M17 13h.01"/>']
];

let allowed = null;
let generation = 0;
let timer = null;
let menuRetry = null;
let rightsRetry = null;

function removeTools() {
  document.querySelectorAll('[data-head-admin-tool]').forEach((button) => button.remove());
}

function findGrid() {
  return document.querySelector('.ec-right-dock .ec-compact-menu-grid')
    || document.querySelector('.ec-compact-menu-grid');
}

function scheduleMenuRetry() {
  clearTimeout(menuRetry);
  menuRetry = setTimeout(syncMenu, 140);
}

function syncMenu() {
  const grid = findGrid();
  if (allowed === false) {
    removeTools();
    return;
  }
  if (allowed !== true) return;
  if (!grid) {
    scheduleMenuRetry();
    return;
  }

  for (const [page, label, icon] of tools) {
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
      button.onclick = () => {
        if (allowed !== true) return;
        document.body.classList.remove('ec-dock-open');
        if (page === 'ads-manager') {
          window.dispatchEvent(new CustomEvent('ec:open-sidebar-ad-manager'));
          return;
        }
        window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
      };
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
        allowed = false;
        syncMenu();
      }
      scheduleRightsRetry();
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role,account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (request !== generation) return;
    if (error || !profile) {
      scheduleRightsRetry();
      return;
    }

    clearTimeout(rightsRetry);
    const nextAllowed = profile.role === 'HEAD_ADMIN' && profile.account_status === 'ACTIVE';
    if (nextAllowed !== allowed) allowed = nextAllowed;
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
    allowed = false;
    syncMenu();
    return;
  }
  timer = setTimeout(() => void refreshRights(), 80);
});

window.addEventListener('focus', () => void refreshRights());
window.addEventListener('ec:navigate', syncMenu);
window.addEventListener('ec:region-change', syncMenu);
void refreshRights({ clearOnMissingUser: true });
