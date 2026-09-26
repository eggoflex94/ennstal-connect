import { supabase } from './supabaseClient';

const THEMES = {
  'layout-theme-red': { key: 'red', logo: '/ennstal-connect-wordmark-red.svg' },
  'layout-theme-blue': { key: 'blue', logo: '/ennstal-connect-wordmark-blue.svg' },
  'layout-theme-neon': { key: 'neon', logo: '/ennstal-connect-wordmark.svg' },
  'layout-theme-alpine': { key: 'alpine', logo: '/ennstal-connect-wordmark.svg' },
  'layout-theme-teal': { key: 'teal', logo: '/ennstal-connect-wordmark.svg' },
  'layout-theme-violet': { key: 'violet', logo: '/ennstal-connect-wordmark.svg' },
  'layout-theme-copper': { key: 'copper', logo: '/ennstal-connect-wordmark.svg' },
  'layout-theme-aurora': { key: 'aurora', logo: '/ennstal-connect-wordmark.svg' },
};
const DEFAULT_LOGO = '/ennstal-connect-wordmark.svg';
const LEGACY_LAYOUTS = new Set(['alpine', 'aurora', 'ocean', 'slate', 'ember', 'redwood', 'lavender', 'midnight', 'sunrise', 'neon']);
const LEVEL_FLOORS = { Neu: 0, Aktiv: 10, Verbunden: 30, Engagiert: 75, 'Community-Profi': 150, Stammmitglied: 300 };
const PRESTIGE_FLOORS = { Bronze: 300, Silber: 450, Gold: 650, Platin: 900 };
const COMPONENT_LABELS = {
  online: 'Aktive Onlinezeit',
  forum_posts: 'Forum-Beiträge',
  forum_replies: 'Antworten',
  friendships: 'Freundschaften',
  groups: 'Gruppen',
  events: 'Events',
  polls: 'Umfragen',
  community_requests: 'Community-Hilfe',
  profile: 'Profil vollständig',
};

let lastKey = '';
let queued = false;
let progress = null;
let progressLoadedAt = 0;
let progressPromise = null;
let savedLayout = 'standard';
let savedLayoutLoadedAt = 0;
let businessUnlocked = false;
let privilegedThemeUnlocked = false;
let appObserver = null;
let observedApp = null;
let shellObserver = null;
let layoutObserver = null;

const withTimeout = (promise, ms = 7000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('Theme-Daten Timeout')), ms)),
]);

function layoutOptions(state) {
  const score = Number(state?.score || 0);
  const allOpen = privilegedThemeUnlocked || businessUnlocked;
  const unlocked = (minimum) => allOpen || score >= minimum;
  return [
    ['standard', 'Standard – Ennstal Connect', true],
    ['theme-red', unlocked(30) ? 'Connect Rot – Hellrot' : '🔒 Connect Rot – ab 30 Aktivitätspunkten', unlocked(30)],
    ['theme-alpine', unlocked(75) ? 'Alpin Grün – Ruhig & Regional' : '🔒 Alpin Grün – ab 75 Aktivitätspunkten', unlocked(75)],
    ['theme-blue', unlocked(150) ? 'Connect Blau – Kräftig' : '🔒 Connect Blau – ab 150 Aktivitätspunkten', unlocked(150)],
    ['theme-teal', unlocked(300) ? 'Bergsee Türkis – Frisch & Klar' : '🔒 Bergsee Türkis – ab 300 Aktivitätspunkten', unlocked(300)],
    ['theme-violet', unlocked(450) ? 'Enzian Violett – Modern & Edel' : '🔒 Enzian Violett – ab 450 Aktivitätspunkten', unlocked(450)],
    ['theme-copper', unlocked(650) ? 'Kupfer Nacht – Kupfer & Tiefpetrol' : '🔒 Kupfer Nacht – ab 650 Aktivitätspunkten', unlocked(650)],
    ['theme-aurora', unlocked(900) ? 'Polarlicht – Cyan, Magenta & Nachtblau' : '🔒 Polarlicht – ab 900 Aktivitätspunkten', unlocked(900)],
    ['theme-neon', unlocked(1200) ? 'Neon Grün – Giftgrün & Dunkel' : '🔒 Neon Grün – ab 1200 Aktivitätspunkten', unlocked(1200)],
  ];
}

function normalizeLayoutSelect(select) {
  if (!select) return;
  const current = String(select.value || 'standard');
  const options = layoutOptions(progress);
  const signature = options.map(([value, label, enabled]) => `${value}:${label}:${enabled}`).join('|');

  if (select.dataset.ecThemeSignature !== signature) {
    select.replaceChildren(...options.map(([value, label, enabled]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.disabled = !enabled;
      return option;
    }));
    select.dataset.ecThemeSignature = signature;
  }

  const preferred = savedLayout && options.some(([value, , enabled]) => value === savedLayout && enabled)
    ? savedLayout
    : current;
  const wanted = options.some(([value, , enabled]) => value === preferred && enabled) ? preferred : 'standard';
  if (select.value !== wanted) select.value = wanted;
}

function rewardText(state) {
  if (privilegedThemeUnlocked || businessUnlocked) return 'Deine Rolle hat alle Profil-Layouts automatisch freigeschaltet.';
  if (!state) return 'Aktivitätsfortschritt derzeit nicht verfügbar.';
  const score = Number(state.score || 0);
  const next = [
    [30, 'Connect Rot'],
    [75, 'Alpin Grün'],
    [150, 'Connect Blau'],
    [300, 'Bergsee Türkis'],
    [450, 'Enzian Violett'],
    [650, 'Kupfer Nacht'],
    [900, 'Polarlicht'],
    [1200, 'Neon Grün'],
  ].find(([minimum]) => score < minimum);
  if (!next) return 'Alle Layoutfarben freigeschaltet.';
  return `Noch ${Math.max(0, next[0] - score)} Punkte bis ${next[1]}.`;
}

function progressPercent(state) {
  if (!state) return 0;
  const score = Number(state.score || 0);
  const next = state.next_score == null ? null : Number(state.next_score);
  if (!next) return 100;
  const floor = Number(LEVEL_FLOORS[state.level] ?? 0);
  return Math.max(0, Math.min(100, Math.round(((score - floor) / Math.max(1, next - floor)) * 100)));
}

function prestigePercent(state) {
  if (!state) return 0;
  const score = Number(state.score || 0);
  const next = state.prestige_next_score == null ? null : Number(state.prestige_next_score);
  if (!next) return 100;
  const floor = Number(state.prestige ? PRESTIGE_FLOORS[state.prestige] : 300);
  return Math.max(0, Math.min(100, Math.round(((score - floor) / Math.max(1, next - floor)) * 100)));
}

function renderProgress(section) {
  if (!section) return;
  let card = section.querySelector('.ec-activity-progress');
  if (!card) {
    card = document.createElement('div');
    card.className = 'ec-activity-progress';
    const select = section.querySelector('select[name="profile_layout"]');
    const directReference = select && select.parentElement === section ? select : null;
    if (directReference) directReference.before(card);
    else section.prepend(card);
  }

  if (!progress) {
    card.innerHTML = '<div class="ec-activity-progress-head"><span>COMMUNITY-LEVEL</span><strong>Derzeit nicht verfügbar</strong></div>';
    return;
  }

  const score = Number(progress.score || 0);
  const next = progress.next_score == null ? null : Number(progress.next_score);
  const components = Object.entries(progress.components || {}).filter(([, points]) => Number(points || 0) > 0);
  const prestigeLabel = progress.prestige ? `Prestige ${progress.prestige}` : 'Prestige ab 300 Punkten';
  const prestigeNext = progress.prestige_next_score == null ? 'höchste Prestige-Stufe' : `nächste Stufe bei ${Number(progress.prestige_next_score)}`;

  card.innerHTML = `<div class="ec-activity-progress-head"><span>COMMUNITY-LEVEL</span><strong>${String(progress.level || 'Neu')}</strong><b>${score} Punkte${next ? ` · nächstes Level bei ${next}` : ' · Level abgeschlossen'}</b></div><div class="ec-activity-progress-bar"><i style="width:${progressPercent(progress)}%"></i></div><div class="ec-activity-prestige-head"><span>${prestigeLabel}</span><b>${prestigeNext}</b></div><div class="ec-activity-progress-bar ec-activity-prestige-bar"><i style="width:${prestigePercent(progress)}%"></i></div><p>${rewardText(progress)}</p><div class="ec-activity-reward-chips">${[
    [30,'Connect Rot'],
    [75,'Alpin Grün'],
    [150,'Connect Blau'],
    [300,'Bergsee Türkis'],
    [450,'Enzian Violett'],
    [650,'Kupfer Nacht'],
    [900,'Polarlicht'],
    [1200,'Neon Grün'],
  ].map(([minimum,label]) => {
    const open = privilegedThemeUnlocked || businessUnlocked || score >= minimum;
    return `<span class="${open ? 'is-unlocked' : 'is-locked'}">${open ? '✓' : '🔒'} ${label}</span>`;
  }).join('')}${progress.prestige ? `<span class="is-prestige">★ ${progress.prestige}</span>` : ''}</div><details class="ec-activity-breakdown"><summary>Wie entstehen meine Punkte?</summary><p>Aktive Onlinezeit zählt langsam weiter. Beiträge, Antworten, Freundschaften, Gruppen, Events und regionale Community-Aktivität zählen stärker.</p><div>${components.map(([key, points]) => `<span><b>+${Number(points)}</b> ${COMPONENT_LABELS[key] || key}</span>`).join('')}</div></details>`;
}

function normalizeLayoutControls() {
  document.querySelectorAll('select[name="profile_layout"]').forEach(normalizeLayoutSelect);
  document.querySelectorAll('.layout-rewards').forEach((section) => {
    const heading = section.querySelector('h3');
    const copy = section.querySelector('p');
    if (heading) heading.textContent = 'Dein Layout';
    if (copy && !copy.closest('.ec-activity-progress')) copy.textContent = 'Der Aufbau bleibt immer gleich. Nur Farben, Tiefe und Stimmung ändern sich.';
    renderProgress(section);
  });
}

function watchLayoutControls() {
  if (layoutObserver) return;
  layoutObserver = new MutationObserver((mutations) => {
    const addedLayoutControl = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.('select[name="profile_layout"]') || Boolean(node.querySelector?.('select[name="profile_layout"]'));
    }));
    if (addedLayoutControl) queueSync();
  });
  layoutObserver.observe(document.documentElement, { childList: true, subtree: true });
}

async function loadSavedLayout(force = false) {
  if (!supabase) return savedLayout;
  if (!force && savedLayoutLoadedAt && Date.now() - savedLayoutLoadedAt < 120000) return savedLayout;
  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000);
    if (!session?.user) return savedLayout;
    const { data, error } = await withTimeout(supabase.from('profiles').select('profile_layout,account_badge,role').eq('id', session.user.id).maybeSingle(), 7000);
    if (!error && data?.profile_layout) savedLayout = String(data.profile_layout);
    businessUnlocked = String(data?.account_badge || '').toUpperCase() === 'BUSINESS';
    privilegedThemeUnlocked = ['HEAD_ADMIN','ADMIN','SUPPORTER'].includes(String(data?.role || '').toUpperCase());
    savedLayoutLoadedAt = Date.now();
  } catch (error) {
    console.warn('Gespeichertes Layout konnte nicht geladen werden:', error?.message || error);
  }
  return savedLayout;
}

async function persistSavedLayout(layout) {
  if (!supabase) return;
  try {
    const { data: { session } } = await withTimeout(supabase.auth.getSession(), 5000);
    if (!session?.user) return;
    const { error } = await withTimeout(supabase.from('profiles').update({ profile_layout: layout }).eq('id', session.user.id), 7000);
    if (error) throw error;
    savedLayout = layout;
    savedLayoutLoadedAt = Date.now();
    window.dispatchEvent(new CustomEvent('ec:profile-layout-saved', { detail: { layout } }));
  } catch (error) {
    console.warn('Layout konnte nicht gespeichert werden:', error?.message || error);
    savedLayoutLoadedAt = 0;
    void loadSavedLayout(true).finally(queueSync);
  }
}

async function loadProgress(force = false) {
  if (!supabase) return null;
  if (!force && progress && Date.now() - progressLoadedAt < 120000) return progress;
  if (progressPromise) return progressPromise;
  progressPromise = (async () => {
    try {
      await loadSavedLayout(force);
      const { data, error } = await withTimeout(supabase.rpc('community_activity_progress'), 7000);
      if (error) throw error;
      progress = data || null;
      progressLoadedAt = Date.now();
      normalizeLayoutControls();
      queueSync();
      return progress;
    } catch (error) {
      console.warn('Community-Level konnte nicht geladen werden:', error?.message || error);
      normalizeLayoutControls();
      queueSync();
      return null;
    } finally {
      progressPromise = null;
    }
  })();
  return progressPromise;
}

function watchApp(app) {
  if (!app || observedApp === app) return;
  appObserver?.disconnect();
  observedApp = app;
  appObserver = new MutationObserver(() => {
    if (savedLayout === 'theme-neon' && !app.classList.contains('layout-theme-neon')) queueSync();
  });
  appObserver.observe(app, { attributes: true, attributeFilter: ['class'] });
}

function watchShell() {
  if (shellObserver) return;
  shellObserver = new MutationObserver(() => {
    const app = document.querySelector('.app');
    if (app && app !== observedApp) queueSync();
  });
  shellObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function syncTheme() {
  normalizeLayoutControls();
  if (document.querySelector('select[name="profile_layout"]')) void loadProgress(false);
  const app = document.querySelector('.app');
  watchApp(app);
  if (app) [...LEGACY_LAYOUTS].forEach((legacy) => app.classList.remove(`layout-${legacy}`));
  if (app) {
    app.classList.toggle('layout-theme-neon', savedLayout === 'theme-neon');
    app.classList.toggle('layout-theme-alpine', savedLayout === 'theme-alpine');
    app.classList.toggle('layout-theme-teal', savedLayout === 'theme-teal');
    app.classList.toggle('layout-theme-violet', savedLayout === 'theme-violet');
    app.classList.toggle('layout-theme-copper', savedLayout === 'theme-copper');
    app.classList.toggle('layout-theme-aurora', savedLayout === 'theme-aurora');
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

function refreshProgress() {
  progressLoadedAt = 0;
  savedLayoutLoadedAt = 0;
  void loadProgress(true);
  queueSync();
}

function boot() {
  watchShell();
  watchLayoutControls();
  normalizeLayoutControls();
  void loadSavedLayout(true).finally(() => {
    syncTheme();
    setTimeout(queueSync, 250);
    setTimeout(queueSync, 900);
    setTimeout(queueSync, 1800);
  });
  void loadProgress(false);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

document.addEventListener('change', (event) => {
  const select = event.target?.closest?.('select[name="profile_layout"]');
  if (!select) return;
  savedLayout = String(select.value || 'standard');
  savedLayoutLoadedAt = Date.now();
  queueSync();
  void persistSavedLayout(savedLayout);
});
window.addEventListener('ec:navigate', () => {
  queueSync();
  if (document.querySelector('select[name="profile_layout"]')) void loadProgress(false);
});
window.addEventListener('ec:region-change', queueSync);
window.addEventListener('focus', queueSync);
window.addEventListener('ec:profile-layout-saved', queueSync);
window.addEventListener('ec:activity-progress-refresh', refreshProgress);
window.addEventListener('ec:online-reward', refreshProgress);
