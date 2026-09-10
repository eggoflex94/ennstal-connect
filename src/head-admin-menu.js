import { supabase } from './supabaseClient';

const tools = [
  ['fake-accounts', 'Fake-Erkennung', '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>'],
  ['admin-log', 'Admin-Logbuch', '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h14M9 7h6M9 11h6"/>']
];

let allowed = null;
let generation = 0;
let timer = null;

function removeTools() {
  document.querySelectorAll('[data-head-admin-tool]').forEach((button) => button.remove());
}

function syncMenu() {
  const grid = document.querySelector('.ec-right-dock .ec-compact-menu-grid');
  if (allowed === false) {
    removeTools();
    return;
  }
  if (allowed !== true || !grid) return;

  for (const [page, label, icon] of tools) {
    if (grid.querySelector(`[data-head-admin-tool="${page}"]`)) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-compact-menu-item ec-dashboard-utility-button';
    button.dataset.headAdminTool = page;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<span class="ec-compact-menu-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span class="ec-compact-menu-label">${label}</span>`;
    button.onclick = () => {
      if (allowed !== true) return;
      document.body.classList.remove('ec-dock-open');
      window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
    };
    grid.append(button);
  }
}

async function refreshRights({ clearOnMissingUser = false } = {}) {
  const request = ++generation;
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (request !== generation) return;
    if (userError || !user) {
      if (clearOnMissingUser) {
        allowed = false;
        syncMenu();
      }
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role,account_status')
      .eq('id', user.id)
      .maybeSingle();

    if (request !== generation) return;
    if (error || !profile) return;

    const nextAllowed = profile.role === 'HEAD_ADMIN' && profile.account_status === 'ACTIVE';
    if (nextAllowed !== allowed) allowed = nextAllowed;
    syncMenu();
  } catch {
    // Bei kurzzeitigen Netzwerk-/Token-Refreshes den bereits bestätigten Zustand beibehalten.
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
    allowed = false;
    syncMenu();
    return;
  }
  timer = setTimeout(() => void refreshRights(), 80);
});

window.addEventListener('focus', () => void refreshRights());
void refreshRights({ clearOnMissingUser: true });
