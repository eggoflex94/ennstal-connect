import { supabase } from './supabaseClient';

let queued = false;
let progress = null;
let progressLoadedAt = 0;
let loading = null;

function starForRoleLabel(label = '') {
  const text = String(label).toLowerCase();
  if (text.includes('betreiber') || text.includes('hauptadmin') || text.includes('regional admin') || text.includes('community admin') || text === 'admin') return '/role-star-red.svg';
  if (text.includes('supporter')) return '/supporter-star.svg';
  if (text.includes('unternehmenskonto') || text.includes('business')) return '/role-star-blue.svg';
  return '';
}

async function loadProgress(force = false) {
  if (!force && progress && Date.now() - progressLoadedAt < 60000) return progress;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
      const { data, error } = await supabase.rpc('community_activity_progress');
      if (error) throw error;
      progress = data || null;
      progressLoadedAt = Date.now();
      return progress;
    } catch (error) {
      console.warn('Punkte-Belohnungen konnten nicht geladen werden:', error?.message || error);
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

function findVisitorPanel() {
  return [...document.querySelectorAll('.profile-timeline.panel')].find((panel) => {
    const eyebrow = panel.querySelector('.eyebrow');
    return String(eyebrow?.textContent || '').trim().toUpperCase() === 'PROFILBESUCHE';
  }) || null;
}

function applyVisitorReward(state) {
  const panel = findVisitorPanel();
  if (!panel || !state) return;
  const unlocked = Boolean(state.profile_visitors_unlocked);
  const list = panel.querySelector(':scope > div:not(.ec-profile-visitors-locked)');
  let locked = panel.querySelector('.ec-profile-visitors-locked');

  if (unlocked) {
    if (list) list.style.removeProperty('display');
    locked?.remove();
    panel.dataset.pointsUnlocked = '1';
    return;
  }

  if (list) list.style.setProperty('display', 'none', 'important');
  if (!locked) {
    locked = document.createElement('div');
    locked.className = 'ec-profile-visitors-locked';
    panel.appendChild(locked);
  }
  const score = Number(state.score || 0);
  const unlockAt = Number(state.profile_visitors_unlock_score || 75);
  const missing = Math.max(0, unlockAt - score);
  locked.innerHTML = `<strong>Profilbesucher noch gesperrt</strong><span>Noch ${missing} Punkte bis zur Freischaltung bei ${unlockAt} Punkten.</span>`;
  panel.dataset.pointsUnlocked = '0';
}

function enhancePointMessages() {
  document.querySelectorAll('.chat-message p').forEach((paragraph) => {
    if (paragraph.dataset.ecPointIdentity === '1') return;
    const raw = String(paragraph.textContent || '').trim();
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3 || !lines[0].startsWith('★ ')) return;
    const actorLine = lines[0].replace(/^★\s*/, '');
    const divider = actorLine.lastIndexOf(' · ');
    if (divider < 0) return;
    const nickname = actorLine.slice(0, divider).trim();
    const roleLabel = actorLine.slice(divider + 3).trim();
    const star = starForRoleLabel(roleLabel);
    const amount = lines[1];
    const reason = lines.slice(2).join(' ');
    paragraph.dataset.ecPointIdentity = '1';
    paragraph.classList.add('ec-point-message');
    paragraph.innerHTML = `<span class="ec-point-message-actor">${star ? `<img src="${star}" alt="" aria-hidden="true">` : ''}<strong></strong></span><b class="ec-point-message-amount"></b><span class="ec-point-message-reason"></span>`;
    paragraph.querySelector('.ec-point-message-actor strong').textContent = nickname;
    paragraph.querySelector('.ec-point-message-amount').textContent = amount;
    paragraph.querySelector('.ec-point-message-reason').textContent = reason;
  });
}

async function apply() {
  const state = await loadProgress(false);
  applyVisitorReward(state);
  enhancePointMessages();
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void apply();
  });
}

function refresh() {
  progressLoadedAt = 0;
  void loadProgress(true).then((state) => {
    applyVisitorReward(state);
    enhancePointMessages();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:activity-progress-refresh', refresh);
window.addEventListener('ec:points-updated', refresh);
window.addEventListener('ec:navigate', schedule);
