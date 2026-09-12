import { supabase } from './supabaseClient';

let accessCache = null;
let accessCacheAt = 0;
let accessPromise = null;
let timers = [];
let modulePromise = null;
let observer = null;
const ACCESS_CACHE_MS = 60_000;

async function canUseAdminTools() {
  if (accessCache === true && Date.now() - accessCacheAt < ACCESS_CACHE_MS) return true;
  if (accessPromise) return accessPromise;
  accessPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return false;
      const { data, error } = await supabase.rpc('ec_has_admin_central_access');
      if (error) {
        console.warn('Admin-Tools-Zugriff konnte nicht geprüft werden:', error.message);
        return false;
      }
      if (data === true) {
        accessCache = true;
        accessCacheAt = Date.now();
        return true;
      }
      // Do not permanently cache false. A profile/permission refresh or a
      // transient request issue must never hide the tools for the whole session.
      return false;
    } catch (error) {
      console.warn('Admin-Tools-Zugriff konnte nicht geprüft werden:', error?.message || error);
      return false;
    } finally {
      accessPromise = null;
    }
  })();
  return accessPromise;
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

  const existing = actions.querySelector('.ec-profile-admin-open[data-profile-admin-authority="fast-entry"]');
  if (existing) return true;

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
  const delays = [0, 100, 300, 700, 1400, 2600];
  timers = delays.map((delay) => setTimeout(async () => {
    const mounted = await mountFastEntry();
    if (mounted) clearTimers();
  }, delay));
}

function startObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.getElementById('root');
  if (!root || observer) return;
  observer = new MutationObserver(() => {
    const actions = document.querySelector('.member-profile-page[data-profile-id] .member-profile-actions');
    if (actions && !actions.querySelector('.ec-profile-admin-open[data-profile-admin-authority="fast-entry"]')) scheduleMounts();
  });
  observer.observe(root, { childList: true, subtree: true });
  scheduleMounts();
}

window.addEventListener('ec:navigate', scheduleMounts);
window.addEventListener('focus', scheduleMounts);
window.addEventListener('ec:region-change', () => { accessCache = null; accessCacheAt = 0; scheduleMounts(); });
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    accessCache = null;
    accessCacheAt = 0;
  }
  scheduleMounts();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
else startObserver();
