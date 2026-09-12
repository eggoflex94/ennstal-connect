let cleanupTimer = null;

const MODAL_SELECTOR = [
  '.ec-admin-hub-overlay',
  '.ec-profile-admin-overlay',
  '.ec-admin-workspace',
  '.group-details-overlay',
  '.public-photo-lightbox'
].join(',');

function visible(node) {
  if (!node || !node.isConnected) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
}

function syncModalLock() {
  const active = [...document.querySelectorAll(MODAL_SELECTOR)].some(visible);
  document.documentElement.classList.toggle('ec-modal-locked', active);
  document.body.classList.toggle('ec-modal-locked', active);
}

function removeDuplicateAdminEntries() {
  const menus = document.querySelectorAll('.ec-right-dock .ec-compact-menu-grid');
  menus.forEach((menu) => {
    const hub = menu.querySelector('[data-ec-admin-central-hub="1"]');
    if (!hub) return;
    menu.querySelectorAll('[data-regional-admin-tools-bridge="1"], [data-ec-admin-primary="1"][data-ec-page="admin"]').forEach((node) => node.remove());
    const duplicates = [...menu.querySelectorAll('[data-head-admin-tool="admin-tools"]')].filter((node) => node !== hub);
    duplicates.forEach((node) => node.remove());
  });
}

function closeTransientNavigation() {
  document.body.classList.remove('ec-dock-open');
  document.querySelectorAll('.ec-right-dock [data-ec-detail].is-open').forEach((button) => button.classList.remove('is-open'));
  document.querySelectorAll('.ec-right-dock .ec-dock-detail.is-open').forEach((panel) => {
    panel.classList.remove('is-open');
    panel.hidden = true;
  });
}

function hardenButtons() {
  document.querySelectorAll('.ec-right-dock .ec-compact-menu-grid>.ec-compact-menu-item').forEach((button) => {
    button.type = button.tagName === 'BUTTON' ? 'button' : button.type;
    button.style.pointerEvents = 'auto';
    if (!button.hasAttribute('tabindex') && button.tagName !== 'BUTTON' && button.tagName !== 'A') button.tabIndex = 0;
  });
}

function cleanup() {
  cleanupTimer = null;
  removeDuplicateAdminEntries();
  hardenButtons();
  syncModalLock();
}

function schedule(delay = 20) {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(cleanup, delay);
}

new MutationObserver(() => schedule(10)).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden', 'style']
});

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.ec-right-dock .ec-compact-menu-grid>.ec-compact-menu-item');
  if (!button) return;
  requestAnimationFrame(closeTransientNavigation);
}, true);

window.addEventListener('ec:navigate', () => {
  closeTransientNavigation();
  schedule(0);
});
window.addEventListener('resize', () => schedule(20), { passive: true });
window.addEventListener('orientationchange', () => schedule(30), { passive: true });
window.addEventListener('focus', () => schedule(10));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const overlays = [...document.querySelectorAll(MODAL_SELECTOR)].filter(visible);
  overlays.at(-1)?.querySelector?.('.ec-admin-hub-close,.ec-profile-admin-close,.group-details-close,.public-photo-lightbox-close')?.click();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
