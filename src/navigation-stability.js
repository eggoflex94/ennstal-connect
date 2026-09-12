// Profile/navigation stability authority.
// React owns profile content and navigation. This module only prevents an old
// ?profile= route from reopening on every directory refresh.

let routeObserver = null;

function clearProfileQuery(expectedId = '') {
  const url = new URL(window.location.href);
  const routedId = url.searchParams.get('profile') || '';
  if (!routedId) return false;
  if (expectedId && routedId !== expectedId) return false;
  url.searchParams.delete('profile');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

function stopRouteObserver() {
  routeObserver?.disconnect();
  routeObserver = null;
}

function settleSharedProfileRoute() {
  const routedId = new URLSearchParams(window.location.search).get('profile');
  if (!routedId) {
    stopRouteObserver();
    return;
  }
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (page?.dataset.profileId === routedId) {
    clearProfileQuery(routedId);
    stopRouteObserver();
  }
}

function ensureRouteObserver() {
  const routedId = new URLSearchParams(window.location.search).get('profile');
  if (!routedId || routeObserver) return;
  const root = document.getElementById('root');
  if (!root) return;
  routeObserver = new MutationObserver(settleSharedProfileRoute);
  routeObserver.observe(root, { childList: true, subtree: true });
}

function boot() {
  settleSharedProfileRoute();
  ensureRouteObserver();
}

window.addEventListener('ec:open-profile', () => {
  // Any explicit in-app profile navigation must stop an old shared-profile URL
  // from reopening on the next members refresh.
  clearProfileQuery();
  stopRouteObserver();
});
window.addEventListener('ec:navigate', () => {
  settleSharedProfileRoute();
  ensureRouteObserver();
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
