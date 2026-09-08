const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const LABELS = [
  'Neue Nachrichten',
  'Freundschaftsanfragen',
  'Neue Inhalte',
  'Merkliste',
  'Neuigkeiten',
  'Forum',
  'Veranstaltungen',
  'Gruppen'
];
const ICONS = {
  'Neue Nachrichten': '✉',
  'Freundschaftsanfragen': '♙+',
  'Neue Inhalte': '▤',
  'Merkliste': '⌑',
  'Neuigkeiten': '▦',
  'Forum': '▣',
  'Veranstaltungen': '□',
  'Gruppen': '♙♙'
};

function parseButton(button) {
  const raw = normalize(button.textContent);
  const match = raw.match(/^(\d+)\s*(.*)$/);
  return {
    count: match ? match[1] : '0',
    label: normalize(match ? match[2] : raw)
  };
}

function isDashboardButton(button) {
  const { label } = parseButton(button);
  return LABELS.includes(label);
}

function cleanupLegacyInjectedNodes() {
  document.querySelectorAll('.ec-home-action-grid').forEach((grid) => {
    if (grid.dataset.ecNativeHomeGrid === '1') return;
    grid.querySelectorAll('[data-ec-modern-home-action="1"]').forEach((button) => button.remove());
    if (!grid.querySelector('button')) grid.remove();
  });
}

function styleNativeButtons() {
  document.querySelectorAll('section,article,div.panel').forEach((section) => {
    const heading = normalize(section.querySelector('h2')?.textContent).toLowerCase();
    if (heading !== 'auf einen blick' && heading !== 'du bist auf dem laufenden') return;

    const buttons = [...section.querySelectorAll('button')].filter(isDashboardButton);
    if (!buttons.length) return;

    const parents = [...new Set(buttons.map((button) => button.parentElement).filter(Boolean))];
    if (parents.length === 1) {
      parents[0].classList.add('ec-home-action-grid');
      parents[0].dataset.ecNativeHomeGrid = '1';
    }
    section.classList.add('ec-home-action-panel');

    const seen = new Set();
    buttons.forEach((button) => {
      const { count, label } = parseButton(button);
      const key = `${heading}:${label}`;
      if (seen.has(key)) {
        if (button.dataset.ecModernHomeAction === '1') button.remove();
        return;
      }
      seen.add(key);
      button.classList.add('ec-home-action-button');
      button.dataset.ecNativeHomeAction = '1';
      button.dataset.count = count || '0';
      button.dataset.icon = ICONS[label] || '•';
    });
  });
}

function apply() {
  cleanupLegacyInjectedNodes();
  styleNativeButtons();
}

function boot() {
  apply();
  window.setTimeout(apply, 300);
  window.setTimeout(apply, 1200);
  window.setTimeout(apply, 2500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
