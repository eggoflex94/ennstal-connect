let cleanupTimer = null;

function removeDuplicateAdminEntries() {
  document.querySelectorAll('.ec-right-dock .ec-compact-menu-grid').forEach((menu) => {
    const hub = menu.querySelector('[data-ec-admin-central-hub="1"]');
    if (!hub) return;
    menu.querySelectorAll('[data-regional-admin-tools-bridge="1"], [data-ec-admin-primary="1"][data-ec-page="admin"]').forEach((node) => node.remove());
    [...menu.querySelectorAll('[data-head-admin-tool="admin-tools"]')]
      .filter((node) => node !== hub)
      .forEach((node) => node.remove());
  });
}

function hardenButtons() {
  document.querySelectorAll('.ec-right-dock .ec-compact-menu-grid>.ec-compact-menu-item').forEach((button) => {
    if (button.tagName === 'BUTTON') button.type = 'button';
    button.style.pointerEvents = 'auto';
    if (!button.hasAttribute('tabindex') && button.tagName !== 'BUTTON' && button.tagName !== 'A') button.tabIndex = 0;
  });
}

function cleanup() {
  cleanupTimer = null;
  document.documentElement.classList.remove('ec-modal-locked');
  document.body.classList.remove('ec-modal-locked');
  removeDuplicateAdminEntries();
  hardenButtons();
}

function schedule(delay = 20) {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(cleanup, delay);
}

new MutationObserver(() => schedule(30)).observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('ec:navigate', () => schedule(0));
window.addEventListener('resize', () => schedule(30), { passive: true });
window.addEventListener('orientationchange', () => schedule(40), { passive: true });
window.addEventListener('focus', () => schedule(10));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
