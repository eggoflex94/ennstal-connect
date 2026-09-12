import { supabase } from './supabaseClient';

let accessCache = null;
let accessCacheAt = 0;
let accessPromise = null;
let modulePromise = null;
let timer = 0;
const ACCESS_CACHE_MS = 60_000;

async function canUseAdminTools() {
  if (accessCache === true && Date.now() - accessCacheAt < ACCESS_CACHE_MS) return true;
  if (accessPromise) return accessPromise;
  accessPromise = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return false;

      // Prefer the profile as the primary source. A HEAD_ADMIN/ADMIN must never
      // lose the profile button because a secondary access RPC is temporarily stale.
      const { data: viewer, error: profileError } = await supabase
        .from('profiles')
        .select('role,account_status,forum_moderator')
        .eq('id', user.id)
        .maybeSingle();
      if (!profileError && viewer?.account_status === 'ACTIVE') {
        const role = String(viewer.role || '').toUpperCase();
        if (role === 'HEAD_ADMIN' || role === 'ADMIN' || viewer.forum_moderator === true) {
          accessCache = true;
          accessCacheAt = Date.now();
          return true;
        }
      }

      const { data, error } = await supabase.rpc('ec_has_admin_central_access', { p_user: user.id });
      if (error) {
        console.warn('Admin-Tools-Zugriff konnte nicht geprüft werden:', error.message);
        return false;
      }
      if (data === true) {
        accessCache = true;
        accessCacheAt = Date.now();
        return true;
      }
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

function clearLegacyButtons() {
  document.querySelectorAll('.ec-profile-admin-portal,.ec-profile-admin-open,[data-profile-admin-button="1"],[data-profile-admin-v2="1"]').forEach(node => node.remove());
  document.querySelectorAll('.ec-profile-admin-inline').forEach(button => {
    const page = button.closest('.member-profile-page[data-profile-id]');
    if (!page || button.dataset.targetProfileId !== page.dataset.profileId) button.remove();
  });
}

async function openAdminTools(targetId, button) {
  if (!targetId || !button) return;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = '⚙ Admin Tools …';
  try {
    modulePromise ||= import('./profile-admin-tools-fallback.js');
    await modulePromise;
    if (typeof window.ecOpenProfileAdminTools !== 'function') throw new Error('Admin Tools konnten nicht geladen werden.');
    await window.ecOpenProfileAdminTools(targetId);
  } catch (error) {
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = previous || '⚙ Admin Tools';
    }
  }
}

async function mountForCurrentProfile() {
  clearLegacyButtons();
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector(':scope > .member-profile-actions');
  const targetId = page?.dataset.profileId || '';
  if (!page || !actions || !targetId) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId || !(await canUseAdminTools())) {
    actions.querySelector('.ec-profile-admin-inline')?.remove();
    return;
  }

  if (!page.isConnected || page.dataset.profileId !== targetId || !actions.isConnected) return;
  let button = actions.querySelector('.ec-profile-admin-inline');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button ec-profile-admin-inline';
    button.textContent = '⚙ Admin Tools';
    button.title = 'Admin Tools';
    button.setAttribute('aria-label', 'Admin Tools');
    actions.prepend(button);
  }
  button.dataset.targetProfileId = targetId;
  button.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    const currentPage = button.closest('.member-profile-page[data-profile-id]');
    if (!currentPage || currentPage.dataset.profileId !== button.dataset.targetProfileId) return;
    void openAdminTools(button.dataset.targetProfileId, button);
  };
}

function schedule(delay = 80) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void mountForCurrentProfile(), delay);
}

window.addEventListener('ec:navigate', () => schedule(50));
window.addEventListener('focus', () => schedule(80));
window.addEventListener('pageshow', () => schedule(80));
window.addEventListener('ec:open-profile', () => schedule(30));
window.addEventListener('ec:region-change', () => {
  accessCache = null;
  accessCacheAt = 0;
  schedule(80);
});
supabase?.auth?.onAuthStateChange?.(event => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    accessCache = null;
    accessCacheAt = 0;
  }
  schedule(80);
});

const observerRoot = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.getElementById('root');
if (observerRoot) {
  new MutationObserver(records => {
    const relevant = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.member-profile-page,.member-profile-actions') || node.querySelector?.('.member-profile-page,.member-profile-actions'))));
    if (relevant) schedule(30);
  }).observe(observerRoot, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(80), { once: true });
else schedule(80);
