const MENU_LABELS = [
  'Benachrichtigungen',
  'Mein Profil',
  'Nachrichten',
  'Freunde',
  'Anfragen',
  'Blockiert',
  'Einstellungen',
  'Hilfe',
  'Heimatregion ändern'
];

const ICONS = {
  'Benachrichtigungen': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
  'Mein Profil': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.4-6 8-6s7.2 1.8 8 6"/></svg>',
  'Nachrichten': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  'Freunde': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.7-3.6 2.8-5 6-5 3.3 0 5.4 1.4 6 5M14.5 15.5c3.4-.8 5.7.6 6.5 4.5"/></svg>',
  'Anfragen': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-3.6 2.8-5 6-5 2.1 0 3.8.6 4.8 1.9M18 8v6M15 11h6"/></svg>',
  'Blockiert': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/></svg>',
  'Einstellungen': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
  'Hilfe': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.2 1.4-2.2 3M12 17h.01"/></svg>',
  'Heimatregion ändern': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>'
};

function textOf(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function labelFor(button) {
  const text = textOf(button);
  return MENU_LABELS.find((label) => text.includes(label)) || button.dataset.ecCompactLabel || '';
}

function decorateButton(button, label) {
  button.classList.add('ec-compact-menu-item');
  button.dataset.ecCompactLabel = label;
  button.title = label;
  button.setAttribute('aria-label', label);

  let icon = button.querySelector(':scope > .ec-compact-menu-icon');
  if (!icon) {
    icon = document.createElement('span');
    icon.className = 'ec-compact-menu-icon';
    icon.innerHTML = ICONS[label] || '';
    button.prepend(icon);
  }

  const legacyIcon = [...button.children].find((child) => child !== icon && child.matches?.('b,i,.icon'));
  if (legacyIcon) legacyIcon.classList.add('ec-compact-legacy-icon');

  const directSpans = [...button.children].filter((child) => child.tagName === 'SPAN' && child !== icon);
  const labelSpan = directSpans.find((span) => textOf(span).includes(label));
  if (labelSpan) labelSpan.classList.add('ec-compact-menu-label');
}

function compactMenu(dock) {
  const buttons = [...dock.querySelectorAll('button,a,[role="button"]')]
    .map((button) => ({ button, label: labelFor(button) }))
    .filter(({ label, button }) => label && !button.closest('.ec-dock-detail') && !button.closest('.ec-dock-admin-slot'));

  if (buttons.length < 5) return;

  let grid = dock.querySelector('.ec-compact-menu-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'ec-compact-menu-grid';
    grid.setAttribute('aria-label', 'Persönliche Funktionen');
    const first = buttons[0].button;
    first.parentElement?.insertBefore(grid, first);
  }

  MENU_LABELS.forEach((wanted) => {
    const entry = buttons.find(({ label }) => label === wanted);
    if (!entry) return;
    decorateButton(entry.button, entry.label);
    if (entry.button.parentElement !== grid) grid.appendChild(entry.button);
  });
}

function compactIdentity(dock) {
  const head = dock.querySelector('.ec-dock-head');
  if (!head) return;

  const strong = head.querySelector('strong');
  if (strong) strong.classList.add('ec-compact-identity-name');

  const home = head.querySelector('.ec-dock-home');
  if (home) home.classList.add('ec-compact-home-region');

  const identity = dock.querySelector('.ec-dock-identity');
  if (identity) identity.classList.add('ec-compact-hide-duplicate-identity');
}

function compactDock() {
  const dock = document.querySelector('.ec-right-dock');
  if (!dock) return;
  dock.classList.add('ec-compact-personal-dock');
  compactIdentity(dock);
  compactMenu(dock);
}

let queued = false;
function scheduleCompact() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    compactDock();
  });
}

function boot() {
  compactDock();
  const observer = new MutationObserver(scheduleCompact);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('ec:region-change', scheduleCompact);
  window.addEventListener('resize', scheduleCompact, { passive: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
