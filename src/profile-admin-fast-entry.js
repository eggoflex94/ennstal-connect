import { supabase } from './supabaseClient';

let accessCache = null;
let accessCacheAt = 0;
let accessPromise = null;
let modulePromise = null;
let portalButton = null;
let currentTargetId = '';
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

async function openAdminTools(targetId) {
  if (!targetId || !portalButton) return;
  const previous = portalButton.textContent;
  portalButton.disabled = true;
  portalButton.textContent = '⚙ Admin Tools …';
  try {
    modulePromise ||= import('./profile-admin-tools-fallback.js');
    await modulePromise;
    if (typeof window.ecOpenProfileAdminTools !== 'function') throw new Error('Admin Tools konnten nicht geladen werden.');
    await window.ecOpenProfileAdminTools(targetId);
  } catch (error) {
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    if (portalButton?.isConnected) {
      portalButton.disabled = false;
      portalButton.textContent = previous || '⚙ Admin Tools';
    }
  }
}

function ensurePortalButton() {
  if (portalButton?.isConnected) return portalButton;
  portalButton = document.createElement('button');
  portalButton.type = 'button';
  portalButton.className = 'secondary-button ec-profile-admin-portal';
  portalButton.textContent = '⚙ Admin Tools';
  portalButton.title = 'Admin Tools';
  portalButton.setAttribute('aria-label', 'Admin Tools');
  portalButton.hidden = true;
  portalButton.style.position = 'fixed';
  portalButton.style.zIndex = '2147481900';
  portalButton.style.minHeight = '44px';
  portalButton.style.padding = '0 16px';
  portalButton.style.borderRadius = '12px';
  portalButton.style.boxShadow = '0 8px 22px rgba(31,55,82,.16)';
  portalButton.onclick = () => void openAdminTools(currentTargetId);
  document.body.appendChild(portalButton);
  return portalButton;
}

async function positionPortal() {
  const button = ensurePortalButton();
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const actions = page?.querySelector('.member-profile-actions');
  const targetId = page?.dataset.profileId || '';
  if (!page || !actions || !targetId) {
    currentTargetId = '';
    button.hidden = true;
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || user.id === targetId || !(await canUseAdminTools())) {
    currentTargetId = '';
    button.hidden = true;
    return;
  }
  if (!page.isConnected || page.dataset.profileId !== targetId) return;

  currentTargetId = targetId;
  button.hidden = false;
  const rect = actions.getBoundingClientRect();
  const width = Math.min(160, Math.max(132, rect.width * 0.18));
  button.style.width = `${Math.round(width)}px`;
  button.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)))}px`;
  button.style.top = `${Math.round(Math.max(8, Math.min(window.innerHeight - 52, rect.bottom + 8)))}px`;
}

function schedulePosition() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void positionPortal();
  });
}

function startObserver() {
  ensurePortalButton();
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main') || document.getElementById('root');
  if (root && !observer) {
    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('.member-profile-page,.member-profile-actions') || node.querySelector?.('.member-profile-page,.member-profile-actions'))));
      if (relevant || document.querySelector('.member-profile-page[data-profile-id]')) schedulePosition();
    });
    observer.observe(root, { childList: true, subtree: true });
  }
  schedulePosition();
}

window.addEventListener('ec:navigate', schedulePosition);
window.addEventListener('resize', schedulePosition, { passive: true });
window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
window.addEventListener('focus', schedulePosition);
window.addEventListener('ec:region-change', () => { accessCache = null; accessCacheAt = 0; schedulePosition(); });
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
    accessCache = null;
    accessCacheAt = 0;
  }
  schedulePosition();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
else startObserver();
