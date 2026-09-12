import { supabase } from './supabaseClient';

let accessCache = null;
let accessPromise = null;
let timer = null;

async function canUseAdminTools() {
  if (accessCache !== null) return accessCache;
  if (accessPromise) return accessPromise;
  accessPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('ec_has_admin_central_access');
      if (error) return false;
      return data === true;
    } catch {
      return false;
    } finally {
      accessPromise = null;
    }
  })();
  accessCache = await accessPromise;
  return accessCache;
}

async function mountFastEntry() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector('.member-profile-actions');
  const targetId = page?.dataset.profileId;
  if (!page || !actions || !targetId || typeof window.ecOpenProfileAdminTools !== 'function') return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId) return;
  if (!(await canUseAdminTools())) return;
  if (!page.isConnected || page.dataset.profileId !== targetId) return;

  let button = actions.querySelector('.ec-profile-admin-open');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button ec-profile-admin-open';
    actions.prepend(button);
  }
  button.dataset.profileAdminAuthority = 'fast-entry';
  button.textContent = '⚙ Admin Tools';
  button.onclick = () => window.ecOpenProfileAdminTools(targetId);
}

function schedule(delay = 20) {
  clearTimeout(timer);
  timer = setTimeout(() => void mountFastEntry(), delay);
}

window.addEventListener('ec:navigate', () => schedule(20));
window.addEventListener('focus', () => schedule(40));
window.addEventListener('ec:region-change', () => { accessCache = null; schedule(40); });
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT') accessCache = null;
  else if (event === 'SIGNED_IN') accessCache = null;
  schedule(50);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
