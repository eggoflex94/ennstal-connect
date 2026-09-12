import { supabase } from './supabaseClient';

let accessCache = null;
let accessPromise = null;
let timers = [];
let modulePromise = null;

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

async function openAdminTools(targetId, button) {
  if (!targetId) return;
  const previous = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = '⚙ Admin Tools …';
  }
  try {
    modulePromise ||= import('./profile-admin-tools-fallback.js');
    await modulePromise;
    if (typeof window.ecOpenProfileAdminTools !== 'function') throw new Error('Admin Tools konnten nicht geladen werden.');
    await window.ecOpenProfileAdminTools(targetId);
  } catch (error) {
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = previous || '⚙ Admin Tools';
    }
  }
}

async function mountFastEntry() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector('.member-profile-actions');
  const targetId = page?.dataset.profileId;
  if (!page || !actions || !targetId) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId) return false;
  if (!(await canUseAdminTools())) return false;
  if (!page.isConnected || page.dataset.profileId !== targetId) return false;

  let button = actions.querySelector('.ec-profile-admin-open');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button ec-profile-admin-open';
    actions.prepend(button);
  }
  button.dataset.profileAdminAuthority = 'fast-entry';
  button.textContent = '⚙ Admin Tools';
  button.onclick = () => void openAdminTools(targetId, button);
  return true;
}

function clearTimers() {
  timers.forEach((timer) => clearTimeout(timer));
  timers = [];
}

function scheduleMounts() {
  clearTimers();
  const delays = [0, 120, 350, 800, 1500];
  timers = delays.map((delay) => setTimeout(async () => {
    const mounted = await mountFastEntry();
    if (mounted) clearTimers();
  }, delay));
}

window.addEventListener('ec:navigate', scheduleMounts);
window.addEventListener('focus', scheduleMounts);
window.addEventListener('ec:region-change', () => { accessCache = null; scheduleMounts(); });
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') accessCache = null;
  scheduleMounts();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleMounts, { once: true });
else scheduleMounts();
