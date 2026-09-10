import { supabase } from './supabaseClient';

const tools = [
  ['fake-accounts', 'Fake-Erkennung', '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/>'],
  ['admin-log', 'Admin-Logbuch', '<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3Z"/><path d="M5 17h14M9 7h6M9 11h6"/>']
];
let allowed = false;
let generation = 0;
let timer;

function syncMenu() {
  const grid = document.querySelector('.ec-right-dock .ec-compact-menu-grid');
  if (!allowed) {
    document.querySelectorAll('[data-head-admin-tool]').forEach(button => button.remove());
    return;
  }
  if (!grid) return;
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
      if (!allowed) return;
      document.body.classList.remove('ec-dock-open');
      window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
    };
    grid.append(button);
  }
}

async function refreshRights() {
  const request = ++generation;
  allowed = false;
  syncMenu();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || request !== generation) return;
    const { data: profile, error } = await supabase.from('profiles').select('role,account_status').eq('id', user.id).maybeSingle();
    if (request !== generation) return;
    allowed = !error && profile?.role === 'HEAD_ADMIN' && profile?.account_status === 'ACTIVE';
    syncMenu();
  } catch { /* Fail closed until the next authentication or focus event. */ }
}

new MutationObserver(syncMenu).observe(document.documentElement, { childList: true, subtree: true });
supabase.auth.onAuthStateChange(() => {
  generation++;
  allowed = false;
  syncMenu();
  clearTimeout(timer);
  timer = setTimeout(() => void refreshRights(), 0);
});
window.addEventListener('focus', () => void refreshRights());
void refreshRights();
