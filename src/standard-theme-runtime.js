const THEMES = {
  'layout-theme-red': { key: 'red', logo: '/ennstal-connect-wordmark-red.svg' },
  'layout-theme-blue': { key: 'blue', logo: '/ennstal-connect-wordmark-blue.svg' },
};
const DEFAULT_LOGO = '/ennstal-connect-wordmark.svg';
const ALLOWED_LAYOUTS = [
  ['standard', 'Standard – Ennstal Connect'],
  ['theme-red', 'Connect Rot – Hellrot'],
  ['theme-blue', 'Connect Blau – Kräftig'],
];
const LEGACY_LAYOUTS = new Set(['alpine','aurora','ocean','slate','ember','redwood','lavender','midnight','sunrise','neon']);
let lastKey = '';
let queued = false;

function normalizeLayoutSelect(select) {
  if (!select || select.dataset.ecThemeAuthority === '1') return;
  const current = String(select.value || 'standard');
  select.replaceChildren(...ALLOWED_LAYOUTS.map(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = ALLOWED_LAYOUTS.some(([value]) => value === current) ? current : 'standard';
  select.dataset.ecThemeAuthority = '1';
}

function normalizeLayoutControls() {
  document.querySelectorAll('select[name="profile_layout"]').forEach(normalizeLayoutSelect);
  document.querySelectorAll('.layout-rewards').forEach((section) => {
    const heading = section.querySelector('h3');
    const copy = section.querySelector('p');
    if (heading) heading.textContent = 'Dein Layout';
    if (copy) copy.textContent = 'Der Aufbau bleibt immer gleich. Wähle Standard, Connect Rot oder Connect Blau.';
  });
}

function syncTheme() {
  normalizeLayoutControls();
  const app = document.querySelector('.app');
  if (app) {
    [...LEGACY_LAYOUTS].forEach((legacy) => app.classList.remove(`layout-${legacy}`));
  }
  const match = app ? Object.entries(THEMES).find(([className]) => app.classList.contains(className)) : null;
  const next = match ? match[1] : { key: 'standard', logo: DEFAULT_LOGO };
  if (next.key !== lastKey) {
    document.documentElement.dataset.ecTheme = next.key;
    lastKey = next.key;
  }
  document.querySelectorAll('.ec-brand-image').forEach((img) => {
    if (img.getAttribute('src') !== next.logo) img.setAttribute('src', next.logo);
  });
}

function queueSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    syncTheme();
  });
}

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncTheme, { once: true });
else syncTheme();
window.addEventListener('ec:navigate', queueSync);
window.addEventListener('ec:region-change', queueSync);
