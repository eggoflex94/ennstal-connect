// Single navigation authority for desktop and mobile.
// Capture sidecar navigation reliably without breaking React's native buttons.
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
  ['requests', 'friend-requests'],
  ['blocked', 'blocked'],
  ['admin', 'admin'],
]);

let lastKey = '';
let lastAt = 0;

function inferTextPage(target) {
  const clickable = target?.closest?.('button,a,[role="button"]');
  if (!clickable) return null;
  if (!clickable.closest('nav,.top-nav,.modern-nav,.ec-regional-shell,.ec-regional-dock')) return null;
  const text = String(clickable.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (text === 'community' || text.includes(' community')) return { button: clickable, raw: 'community' };
  return null;
}

function resolveNavigation(target) {
  const explicit = target?.closest?.('[data-ec-page]');
  if (explicit) return { button: explicit, raw: String(explicit.dataset.ecPage || '') };
  return inferTextPage(target);
}

function navigate(raw, button) {
  const page = PAGE_MAP.get(raw) || raw;
  if (!page || page === 'help' || page === 'adminTools' || page === 'legal' || page === 'notifications') return false;

  const now = Date.now();
  const key = `${page}:${button?.dataset?.ecPage || button?.textContent || ''}`;
  if (key === lastKey && now - lastAt < 350) return true;
  lastKey = key;
  lastAt = now;

  document.body.classList.remove('ec-dock-open');
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
  return true;
}

function handlePointerUp(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const nav = resolveNavigation(event.target);
  if (!nav || nav.button?.disabled) return;
  if (!navigate(nav.raw, nav.button)) return;

  // Prevent the legacy sidecar from also acting on the same interaction while
  // keeping other document listeners available for normal React behavior.
  if (nav.button.closest('.ec-regional-shell,.ec-regional-dock') || nav.button.hasAttribute('data-ec-page')) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function handleClick(event) {
  const nav = resolveNavigation(event.target);
  if (!nav || nav.button?.disabled) return;
  if (!navigate(nav.raw, nav.button)) return;
  if (nav.button.closest('.ec-regional-shell,.ec-regional-dock') || nav.button.hasAttribute('data-ec-page')) {
    event.preventDefault();
    event.stopPropagation();
  }
}

document.addEventListener('pointerup', handlePointerUp, true);
document.addEventListener('click', handleClick, true);

function prepareSidecarButtons() {
  document.querySelectorAll('.ec-regional-shell [data-ec-page],.ec-regional-dock [data-ec-page],.ec-regional-right-button[data-ec-page]').forEach((button) => {
    button.onclick = null;
    button.style.touchAction = 'manipulation';
    button.style.webkitTapHighlightColor = 'transparent';
  });
}

let queued = false;
function scheduleCleanup() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    prepareSidecarButtons();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepareSidecarButtons, { once: true });
else prepareSidecarButtons();
new MutationObserver(scheduleCleanup).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', scheduleCleanup);
setTimeout(prepareSidecarButtons, 0);
setTimeout(prepareSidecarButtons, 300);

export {};
