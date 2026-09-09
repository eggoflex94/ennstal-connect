const THEMES = {
  'layout-theme-red': { key: 'red', logo: '/ennstal-connect-wordmark-red.svg' },
  'layout-theme-blue': { key: 'blue', logo: '/ennstal-connect-wordmark-blue.svg' },
};
const DEFAULT_LOGO = '/ennstal-connect-wordmark.svg';
let lastKey = '';

function syncTheme() {
  const app = document.querySelector('.app');
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

const observer = new MutationObserver(() => requestAnimationFrame(syncTheme));
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncTheme, { once: true });
else syncTheme();
window.addEventListener('ec:navigate', syncTheme);
window.addEventListener('ec:region-change', syncTheme);
