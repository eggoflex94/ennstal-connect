// Single navigation authority for desktop and mobile.
// Capture the interaction before legacy handlers can trigger synthetic clicks or overlays.
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

let lastTarget = null;
let lastAt = 0;

function resolveButton(target) {
  return target?.closest?.('.ec-regional-shell [data-ec-page], .ec-regional-right-button[data-ec-page]') || null;
}

function navigateButton(button) {
  const raw = String(button?.dataset?.ecPage || '');
  const page = PAGE_MAP.get(raw) || raw;
  if (!page || page === 'help' || page === 'adminTools' || page === 'legal' || page === 'notifications') return false;

  const now = Date.now();
  if (lastTarget === button && now - lastAt < 450) return true;
  lastTarget = button;
  lastAt = now;

  document.body.classList.remove('ec-dock-open');
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
  return true;
}

function handlePointerUp(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const button = resolveButton(event.target);
  if (!button || button.disabled) return;
  if (!navigateButton(button)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handleClick(event) {
  const button = resolveButton(event.target);
  if (!button || button.disabled) return;
  if (!navigateButton(button)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

// pointerup gives touch devices immediate, reliable one-tap navigation.
document.addEventListener('pointerup', handlePointerUp, true);
// click remains as keyboard/accessibility and older-browser fallback.
document.addEventListener('click', handleClick, true);

function cleanLegacyHandlers() {
  document.querySelectorAll('.ec-regional-shell [data-ec-page], .ec-regional-right-button[data-ec-page]').forEach((button) => {
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
    cleanLegacyHandlers();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanLegacyHandlers, { once: true });
else cleanLegacyHandlers();

new MutationObserver(scheduleCleanup).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', scheduleCleanup);
setTimeout(cleanLegacyHandlers, 0);
setTimeout(cleanLegacyHandlers, 300);

export {};
