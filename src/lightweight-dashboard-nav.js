// Lightweight navigation bridge for the regional shell.
// Core destinations are React-owned, so shell icon clicks can go directly to
// the existing ec:navigate bridge instead of scanning/clicking legacy DOM.
// Special destinations (events/help/notifications/admin tools/legal) keep the
// existing shell handlers because they may open a sub-view or dedicated tool.

const DIRECT_PAGES = new Set([
  'home',
  'members',
  'forum',
  'groups',
  'community',
  'news',
  'profile',
  'messages',
  'friends',
  'requests',
  'blocked',
  'admin',
]);

let lastPage = '';
let lastAt = 0;

function setActiveIcon(page) {
  document.querySelectorAll('.ec-regional-shell [data-ec-page]').forEach((button) => {
    const active = button.dataset.ecPage === page;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function navigate(page) {
  const now = performance.now();
  if (page === lastPage && now - lastAt < 250) return;
  lastPage = page;
  lastAt = now;
  setActiveIcon(page);
  document.body.classList.remove('ec-dock-open');
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page, source: 'lightweight-shell' } }));
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.ec-regional-shell [data-ec-page]');
  if (!button) return;
  const page = button.dataset.ecPage || '';
  if (!DIRECT_PAGES.has(page)) return;

  // Capture the click before the legacy shell onclick handler. React already
  // owns these routes, so no fallback DOM search or post-navigation reload is
  // needed for them.
  event.preventDefault();
  event.stopImmediatePropagation();
  navigate(page);
}, true);

window.addEventListener('ec:navigate', (event) => {
  const page = String(event.detail?.page || '');
  if (page) setActiveIcon(page);
});
