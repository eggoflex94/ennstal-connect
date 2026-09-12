let mountTimer = null;

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
    window.alert(error?.message || 'Admin Tools konnten nicht geladen werden.');
  } finally {
    button.dataset.loading = '0';
    button.disabled = false;
    button.textContent = original;
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

  const existing = actions.querySelector('.ec-profile-admin-open');
  if (!hasAdminSurface(page)) {
    existing?.remove();
    return;
  }

  page.querySelectorAll('.member-admin-tools,.feature-unlocks,.head-admin-media-tools,.member-business-tool').forEach((element) => {
    element.style.setProperty('display', 'none', 'important');
  });
  page.querySelectorAll('button').forEach((button) => {
    if (/punkteliste|punkte vergeben/i.test(String(button.textContent || ''))) {
      button.style.setProperty('display', 'none', 'important');
    }
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

const root = document.getElementById('root') || document.documentElement;
new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
    node?.nodeType === Node.ELEMENT_NODE &&
    (node.matches?.('.member-profile-page,.member-profile-actions,.member-admin-tools') || node.querySelector?.('.member-profile-page,.member-profile-actions,.member-admin-tools'))
  ));
  if (relevant) scheduleMount();
}).observe(root, { childList: true, subtree: true });

window.addEventListener('ec:navigate', () => scheduleMount());
window.addEventListener('focus', () => scheduleMount(20));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleMount(), { once: true });
else scheduleMount(0);
