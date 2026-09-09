import { supabase } from './supabaseClient';

const THEMES = {
  'layout-theme-red': { key: 'red', logo: '/ennstal-connect-wordmark-red.svg' },
  'layout-theme-blue': { key: 'blue', logo: '/ennstal-connect-wordmark-blue.svg' },
};
const DEFAULT_LOGO = '/ennstal-connect-wordmark.svg';
const LEGACY_LAYOUTS = new Set(['alpine','aurora','ocean','slate','ember','redwood','lavender','midnight','sunrise','neon']);
const LEVEL_FLOORS = { Neu: 0, Aktiv: 10, Verbunden: 30, Engagiert: 75, 'Community-Profi': 150, Stammmitglied: 300 };
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

function layoutOptions(state) {
  const redOpen = Boolean(state?.red_unlocked);
  const blueOpen = Boolean(state?.blue_unlocked);
  return [
    ['standard', 'Standard – Ennstal Connect', true],
    ['theme-red', redOpen ? 'Connect Rot – Hellrot' : '🔒 Connect Rot – ab 30 Aktivitätspunkten', redOpen],
    ['theme-blue', blueOpen ? 'Connect Blau – Kräftig' : '🔒 Connect Blau – ab 150 Aktivitätspunkten', blueOpen],
  ];
}

function normalizeLayoutSelect(select) {
  if (!select) return;
  const current = String(select.value || 'standard');
  const options = layoutOptions(progress);
  const signature = options.map(([value,label,enabled]) => `${value}:${label}:${enabled}`).join('|');
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
  const wanted = options.some(([value,,enabled]) => value === current && enabled) ? current : 'standard';
  if (select.value !== wanted) select.value = wanted;
}

function rewardText(state) {
  if (!state) return 'Aktivitätsfortschritt wird geladen …';
  if (state.privileged) return 'Deine Rolle schaltet Connect Rot und Connect Blau sofort frei. Dein Community-Level steigt trotzdem weiter.';
  const score = Number(state.score || 0);
  if (!state.red_unlocked) return `Noch ${Math.max(0, 30 - score)} Punkte bis Connect Rot.`;
  if (!state.blue_unlocked) return `Connect Rot ist frei. Noch ${Math.max(0, 150 - score)} Punkte bis Connect Blau.`;
  return 'Connect Rot und Connect Blau sind freigeschaltet.';
}

function progressPercent(state) {
  if (!state) return 0;
  const score = Number(state.score || 0);
  const next = state.next_score == null ? null : Number(state.next_score);
  if (!next) return 100;
  const floor = Number(LEVEL_FLOORS[state.level] ?? 0);
  return Math.max(0, Math.min(100, Math.round(((score - floor) / Math.max(1, next - floor)) * 100)));
}

function renderProgress(section) {
  if (!section) return;
  let card = section.querySelector('.ec-activity-progress');
  if (!card) {
    card = document.createElement('div');
    card.className = 'ec-activity-progress';
    const select = section.querySelector('select[name="profile_layout"]');
    if (select) section.insertBefore(card, select);
    else section.appendChild(card);
  }
  if (!progress) {
    card.innerHTML = '<div class="ec-activity-progress-head"><span>COMMUNITY-LEVEL</span><strong>Wird geladen …</strong></div>';
    return;
  }
  const score = Number(progress.score || 0);
  const next = progress.next_score == null ? null : Number(progress.next_score);
  const components = Object.entries(progress.components || {}).filter(([,points]) => Number(points || 0) > 0);
  card.innerHTML = `
    <div class="ec-activity-progress-head">
      <span>COMMUNITY-LEVEL</span>
      <strong>${String(progress.level || 'Neu')}</strong>
      <b>${score} Punkte${next ? ` · nächstes Level bei ${next}` : ' · höchste Stufe'}</b>
    </div>
    <div class="ec-activity-progress-bar" aria-label="Fortschritt zum nächsten Community-Level"><i style="width:${progressPercent(progress)}%"></i></div>
    <p>${rewardText(progress)}</p>
    <div class="ec-activity-reward-chips">
      <span class="${progress.red_unlocked ? 'is-unlocked' : 'is-locked'}">${progress.red_unlocked ? '✓' : '🔒'} Connect Rot</span>
      <span class="${progress.blue_unlocked ? 'is-unlocked' : 'is-locked'}">${progress.blue_unlocked ? '✓' : '🔒'} Connect Blau</span>
    </div>
    <details class="ec-activity-breakdown">
      <summary>Wie entstehen meine Punkte?</summary>
      <p>Aktive Onlinezeit zählt bewusst langsam. Beiträge, Antworten, Freundschaften, Gruppen, Events und regionale Community-Aktivität zählen stärker.</p>
      <div>${components.map(([key,points]) => `<span><b>+${Number(points)}</b> ${COMPONENT_LABELS[key] || key}</span>`).join('')}</div>
    </details>`;
}

function normalizeLayoutControls() {
  document.querySelectorAll('select[name="profile_layout"]').forEach(normalizeLayoutSelect);
  document.querySelectorAll('.layout-rewards').forEach((section) => {
    const heading = section.querySelector('h3');
    const copy = section.querySelector('p');
    if (heading) heading.textContent = 'Dein Layout';
    if (copy && !copy.closest('.ec-activity-progress')) copy.textContent = 'Der Aufbau bleibt immer gleich. Neue Farbdesigns schaltest du durch echte Community-Aktivität frei.';
    renderProgress(section);
  });
}

async function loadProgress(force = false) {
  if (!supabase) return null;
  if (!force && progress && Date.now() - progressLoadedAt < 120000) return progress;
  if (progressPromise) return progressPromise;
  progressPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const { data, error } = await supabase.rpc('community_activity_progress');
      if (error) throw error;
      progress = data || null;
      progressLoadedAt = Date.now();
      normalizeLayoutControls();
      return progress;
    } catch (error) {
      console.warn('Community-Level konnte nicht geladen werden:', error?.message || error);
      return null;
    } finally {
      progressPromise = null;
    }
  })();
  return progressPromise;
}

function syncTheme() {
  normalizeLayoutControls();
  if (document.querySelector('select[name="profile_layout"]')) void loadProgress(false);
  const app = document.querySelector('.app');
  if (app) [...LEGACY_LAYOUTS].forEach((legacy) => app.classList.remove(`layout-${legacy}`));
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
  void loadProgress(true);
  queueSync();
}

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncTheme, { once: true });
else syncTheme();
window.addEventListener('ec:navigate', () => { refreshProgress(); queueSync(); });
window.addEventListener('ec:region-change', queueSync);
window.addEventListener('ec:activity-progress-refresh', refreshProgress);
window.addEventListener('ec:online-reward', refreshProgress);
