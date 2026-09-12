let mountTimer = null;
let observer = null;
let observedRoot = null;
let observerRetry = null;

function legacyAdminElements(page) {
  if (!page) return [];
  const elements = [...page.querySelectorAll('.member-admin-tools,.feature-unlocks,.head-admin-media-tools,.member-business-tool')];
  page.querySelectorAll('button').forEach((button) => {
    if (/punkteliste|punkte vergeben/i.test(String(button.textContent || ''))) elements.push(button);
  });
  return [...new Set(elements)];
}

function restoreLegacyAdminSurface(targetId) {
  const page = document.querySelector(`.member-profile-page[data-profile-id="${CSS.escape(String(targetId || ''))}"]`)
    || document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) return false;
  const elements = legacyAdminElements(page);
  elements.forEach((element) => {
    element.style.removeProperty('display');
    element.hidden = false;
  });
  page.classList.add('ec-profile-admin-fallback-active');
  return elements.length > 0;
}

async function openAdminTools(targetId, button) {
  if (!targetId || !button || button.dataset.loading === '1') return;
  const original = button.textContent;
  button.dataset.loading = '1';
  button.disabled = true;
  button.textContent = '⚙ Admin Tools werden geladen …';
  try {
    await import('./profile-admin-tools-runtime.js');
    if (typeof window.ecOpenUnifiedProfileAdminTools !== 'function') {
      throw new Error('Admin Tools konnten nicht initialisiert werden.');
    }
    await window.ecOpenUnifiedProfileAdminTools(targetId);
  } catch (error) {
    console.error('Admin Tools konnten nicht geladen werden:', error);
    const restored = restoreLegacyAdminSurface(targetId);
    if (restored) {
      button.remove();
      window.alert('Die erweiterten Admin Tools konnten nicht geöffnet werden. Die direkten Profil-Admin-Werkzeuge wurden stattdessen wieder eingeblendet.');
      return;
    }
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    if (button.isConnected) {
      button.dataset.loading = '0';
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function hasAdminSurface(page) {
  if (page.querySelector('.member-admin-tools,.feature-unlocks,.head-admin-media-tools,.member-business-tool')) return true;
  return [...page.querySelectorAll('button')].some((button) => /punkteliste|punkte vergeben/i.test(String(button.textContent || '')));
}

function mount() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) return;
  const targetId = page.dataset.profileId;
  const actions = page.querySelector('.member-profile-actions');
  if (!targetId || !actions) return;

  if (page.classList.contains('ec-profile-admin-fallback-active')) return;

  const existing = actions.querySelector('.ec-profile-admin-open');
  if (!hasAdminSurface(page)) {
    existing?.remove();
    return;
  }

  legacyAdminElements(page).forEach((element) => {
    element.style.setProperty('display', 'none', 'important');
  });

  if (existing) {
    existing.onclick = () => openAdminTools(targetId, existing);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary-button ec-profile-admin-open';
  button.textContent = '⚙ Admin Tools';
  button.onclick = () => openAdminTools(targetId, button);
  actions.prepend(button);
}

function scheduleMount(delay = 40) {
  window.clearTimeout(mountTimer);
  mountTimer = window.setTimeout(mount, delay);
}

function desiredObserverRoot() {
  return document.querySelector('.content-root') || document.querySelector('.modern-main');
}

function attachObserver() {
  const root = desiredObserverRoot();
  if (!root) {
    if (!observerRetry) observerRetry = window.setTimeout(() => { observerRetry = null; attachObserver(); }, 250);
    return;
  }
  if (observer && observedRoot === root) return;
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
      node?.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.('.member-profile-page,.member-profile-actions,.member-admin-tools') || node.querySelector?.('.member-profile-page,.member-profile-actions,.member-admin-tools'))
    ));
    if (relevant) scheduleMount();
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh(delay = 40) {
  attachObserver();
  scheduleMount(delay);
}

window.addEventListener('ec:navigate', () => refresh());
window.addEventListener('focus', () => refresh(20));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
else refresh(0);
