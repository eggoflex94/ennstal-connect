import { supabase } from './supabaseClient';

let accessCache = null;
let accessCacheAt = 0;
let accessPromise = null;
let modulePromise = null;
let scheduled = false;
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

function removeCompetingButtons(actions = null) {
  document.querySelectorAll('.ec-profile-admin-portal').forEach((node) => node.remove());
  document.querySelectorAll('.ec-profile-admin-open').forEach((node) => node.remove());
  if (actions) {
    [...actions.querySelectorAll('button')].forEach((button) => {
      if (button.classList.contains('ec-profile-admin-inline')) return;
      if (String(button.textContent || '').trim() === '⚙ Admin Tools') button.remove();
    });
  }
}

async function openAdminTools(targetId, button) {
  if (!targetId || !button) return;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = '⚙ Admin Tools …';
  try {
    modulePromise ||= import('./profile-admin-tools-fallback.js');
    await modulePromise;
    removeCompetingButtons(button.closest('.member-profile-actions'));
    if (typeof window.ecOpenProfileAdminTools !== 'function') throw new Error('Admin Tools konnten nicht geladen werden.');
    await window.ecOpenProfileAdminTools(targetId);
  } catch (error) {
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = previous || '⚙ Admin Tools';
    }
    scheduleMount();
  }
}

async function mountInlineButton() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector('.member-profile-actions');
  const targetId = page?.dataset.profileId || '';

  removeCompetingButtons(actions || null);
  document.querySelectorAll('.ec-profile-admin-inline').forEach((button) => {
    if (!actions || button.parentElement !== actions) button.remove();
  });

  if (!page || !actions || !targetId) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId || !(await canUseAdminTools())) {
    actions.querySelector('.ec-profile-admin-inline')?.remove();
    return false;
  }
  if (!page.isConnected || page.dataset.profileId !== targetId || !actions.isConnected) return false;

  let button = actions.querySelector('.ec-profile-admin-inline');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button ec-profile-admin-inline';
    button.textContent = '⚙ Admin Tools';
    button.title = 'Admin Tools';
    button.setAttribute('aria-label', 'Admin Tools');
    button.dataset.profileAdminAuthority = 'inline';
    actions.appendChild(button);
  }

  button.dataset.targetProfileId = targetId;
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openAdminTools(button.dataset.targetProfileId, button);
  };
  return true;
}

function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void mountInlineButton();
  });
}

function startObserver() {
  removeCompetingButtons();
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.getElementById('root');
  if (root && !observer) {
    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        (node.matches?.('.member-profile-page,.member-profile-actions,.ec-profile-admin-inline,.ec-profile-admin-open,.ec-profile-admin-portal') || node.querySelector?.('.member-profile-page,.member-profile-actions,.ec-profile-admin-open'))
      ));
      if (relevant) scheduleMount();
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  scheduleMount();
}

window.addEventListener('ec:navigate', scheduleMount);
window.addEventListener('focus', scheduleMount);
window.addEventListener('ec:region-change', () => {
  accessCache = null;
  accessCacheAt = 0;
  scheduleMount();
});
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    accessCache = null;
    accessCacheAt = 0;
  }
  scheduleMount();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
else startObserver();
