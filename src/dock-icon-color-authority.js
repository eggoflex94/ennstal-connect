const ICONS = {
  'Benachrichtigungen': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 6.5-3 7-3 9h18c0-2-3-2.5-3-9Z"/><path d="M10 20h4"/></svg>',
  'Mein Profil': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 3.4-6 8-6s7.2 1.8 8 6"/></svg>',
  'Nachrichten': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>',
  'Freunde': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.7-3.6 2.8-5 6-5 3.3 0 5.4 1.4 6 5M14.5 15.5c3.4-.8 5.7.6 6.5 4.5"/></svg>',
  'Anfragen': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-3.6 2.8-5 6-5 2.1 0 3.8.6 4.8 1.9M18 8v6M15 11h6"/></svg>',
  'Blockiert': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m6 18 12-12"/></svg>',
  'Einstellungen': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3.1a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3.1h4.4l.4-3.1a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>',
  'Hilfe': '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 4.5 1.5c-.8 1-2.2 1.4-2.2 3M12 17h.01"/></svg>',
  'Heimatregion ändern': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>',
  'Admin-Zentrale': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6.5V12c0 4.7 3 7.4 7.5 9 4.5-1.6 7.5-4.3 7.5-9V6.5L12 3Z"/><path d="M9 12.2 11.1 14 15.5 9.7"/></svg>',
  'Team-Aktivitäten': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  'Fake-Erkennung': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6Z"/><circle cx="11" cy="11" r="3"/><path d="m13.5 13.5 3 3"/></svg>',
  'Werbung': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9h10M7 13h6M17 13h.01"/></svg>',
  'Beweissicherung': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 7h14M6 7l-3 6h6L6 7Zm12 0-3 6h6l-3-6Z"/><path d="M7 21h10"/></svg>'
};

const TONES = {
  'Benachrichtigungen': 'amber', 'Mein Profil': 'blue', 'Nachrichten': 'cyan', 'Freunde': 'green',
  'Anfragen': 'lime', 'Blockiert': 'red', 'Einstellungen': 'slate', 'Hilfe': 'violet',
  'Heimatregion ändern': 'orange', 'Admin-Zentrale': 'admin', 'Team-Aktivitäten': 'gold',
  'Fake-Erkennung': 'rose', 'Werbung': 'pink', 'Beweissicherung': 'indigo'
};

function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

function labelFor(button) {
  const candidates = [button.dataset.ecCompactLabel, button.getAttribute('aria-label'), button.title, clean(button.textContent)];
  for (const candidate of candidates) {
    const text = clean(candidate);
    const found = Object.keys(ICONS).find((label) => text === label || text.includes(label));
    if (found) return found;
  }
  if (button.dataset.ecAdminCentralHub === '1') return 'Admin-Zentrale';
  if (button.dataset.headAdminTool === 'admin-tools') return 'Admin-Zentrale';
  if (button.dataset.headAdminTool === 'admin-log') return 'Team-Aktivitäten';
  if (button.dataset.headAdminTool === 'fake-accounts') return 'Fake-Erkennung';
  if (button.dataset.headAdminTool === 'ads-manager') return 'Werbung';
  if (button.dataset.ecPage === 'legal') return 'Beweissicherung';
  return '';
}

function applyButton(button) {
  const label = labelFor(button);
  if (!label) return;
  button.dataset.ecIconTone = TONES[label] || 'slate';
  button.dataset.ecCompactLabel = label;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.classList.add('ec-colored-dock-icon');
  let icon = button.querySelector(':scope > .ec-compact-menu-icon');
  if (!icon) {
    icon = document.createElement('span');
    icon.className = 'ec-compact-menu-icon';
    button.prepend(icon);
  }
  if (icon.dataset.ecModernIcon !== label) {
    icon.innerHTML = ICONS[label];
    icon.dataset.ecModernIcon = label;
  }
  [...button.children].forEach((child) => {
    if (child !== icon && child.matches?.('span,b,i,.icon')) child.classList.add('ec-compact-menu-label');
  });
}

function applyAll() {
  const grid = document.querySelector('.ec-right-dock .ec-compact-menu-grid');
  if (!grid) return false;
  grid.querySelectorAll(':scope > button, :scope > a, :scope > [role="button"]').forEach(applyButton);
  return true;
}

let timers = [];
function scheduleApply() {
  timers.forEach((timer) => clearTimeout(timer));
  timers = [0, 120, 350, 800, 1400].map((delay) => setTimeout(applyAll, delay));
}

window.addEventListener('ec:navigate', scheduleApply);
window.addEventListener('ec:region-change', scheduleApply);
window.addEventListener('focus', scheduleApply);
window.addEventListener('ec:open-notifications', scheduleApply);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
else scheduleApply();
