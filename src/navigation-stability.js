/* Keep the regional shell as a thin navigation surface.
   React owns the actual page state. Intercept primary shell navigation before
   legacy fallback click-search logic can fire a second synthetic click. */

const DIRECT_PAGES = new Set([
  'home', 'members', 'forum', 'groups', 'events', 'news', 'community',
  'profile', 'messages', 'friends', 'requests', 'blocked', 'admin'
]);

function handleShellNavigation(event) {
  if (event.type === 'click' && event.button !== 0) return;
  const button = event.target.closest?.('.ec-regional-shell [data-ec-page]');
  if (!button) return;
  const page = String(button.dataset.ecPage || '');
  if (!DIRECT_PAGES.has(page)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.body.classList.remove('ec-dock-open');
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
}

document.addEventListener('click', handleShellNavigation, true);
