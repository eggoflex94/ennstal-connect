/* Mobile navigation must never reparent React-owned navigation buttons.
   React reconciles the .ec-top-nav children itself; moving those nodes into
   another container caused intermittent insertBefore NotFoundError failures
   during navigation and responsive layout changes. */
const MOBILE_QUERY = '(max-width: 760px)';
let queued = false;

function sync() {
  queued = false;
  const nav = document.querySelector('.ec-top-nav');
  if (!nav) return;
  nav.classList.toggle('ec-mobile-nav-ready', window.matchMedia(MOBILE_QUERY).matches);
  // Clean up the legacy rail only when it is empty. Never move React-owned
  // buttons out of it here; a page reload after deployment removes old rails.
  const legacyRail = nav.querySelector(':scope > .ec-mobile-nav-rail');
  if (legacyRail && !legacyRail.children.length) legacyRail.remove();
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

window.addEventListener('resize', schedule, { passive: true });
window.addEventListener('orientationchange', schedule, { passive: true });
window.addEventListener('ec:navigate', schedule);
window.addEventListener('ec:region-change', schedule);
window.addEventListener('focus', schedule);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    schedule();
    setTimeout(schedule, 250);
    setTimeout(schedule, 900);
  }, { once: true });
} else {
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 900);
}
