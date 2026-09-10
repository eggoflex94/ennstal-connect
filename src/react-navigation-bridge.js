// Direct navigation bridge for the visible regional shell.
// No capture listeners, no synthetic clicks and no event suppression.
const PAGE_MAP = new Map([
  ['home', 'home'],
  ['members', 'members'],
  ['forum', 'forum'],
  ['groups', 'groups'],
  ['events', 'community'],
  ['news', 'news'],
  ['community', 'community'],
  ['profile', 'profile'],
  ['messages', 'messages'],
  ['friends', 'friends'],
  ['requests', 'requests'],
  ['blocked', 'blocked'],
  ['admin', 'admin'],
]);

function bindNavigationButtons() {
  document.querySelectorAll('.ec-regional-shell [data-ec-page]').forEach((button) => {
    const rawPage = String(button.dataset.ecPage || '');
    if (!PAGE_MAP.has(rawPage) || button.dataset.ecReactNavigation === '1') return;

    button.dataset.ecReactNavigation = '1';
    button.addEventListener('click', () => {
      const page = PAGE_MAP.get(rawPage);
      window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
      document.body.classList.remove('ec-dock-open');
    });
  });
}

let queued = false;
function scheduleNavigationBinding() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    bindNavigationButtons();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindNavigationButtons, { once: true });
} else {
  bindNavigationButtons();
}

new MutationObserver(scheduleNavigationBinding).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
