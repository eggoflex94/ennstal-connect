import { supabase } from './supabaseClient';

let queued = false;
let lastNickname = '';
let lastProfile = null;
let loadingNickname = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function ensureSummary(profile) {
  const hero = document.querySelector('.profile-view.integrated-profile-view .integrated-profile-hero');
  if (!hero || !profile) return;

  let summary = hero.querySelector('.ec-profile-identity-summary');
  if (!summary) {
    summary = document.createElement('aside');
    summary.className = 'ec-profile-identity-summary';
    summary.setAttribute('aria-label', 'Profildaten');
    hero.appendChild(summary);
  }

  const signature = JSON.stringify([profile.nickname || '', profile.first_name || '', profile.last_name || '']);
  if (summary.dataset.signature === signature) return;
  summary.dataset.signature = signature;
  summary.innerHTML = `
    <div class="ec-profile-identity-card"><span>NICKNAME</span><strong>${esc(profile.nickname || '—')}</strong></div>
    <div class="ec-profile-identity-card"><span>VORNAME</span><strong>${esc(profile.first_name || '—')}</strong></div>
    <div class="ec-profile-identity-card"><span>NACHNAME</span><strong>${esc(profile.last_name || '—')}</strong></div>`;
}

async function syncSummary() {
  const title = document.querySelector('.profile-view.integrated-profile-view .integrated-profile-title h1');
  const nickname = String(title?.textContent || '').trim();
  if (!nickname) return;

  if (lastNickname === nickname && lastProfile) {
    ensureSummary(lastProfile);
    return;
  }
  if (loadingNickname === nickname) return;
  loadingNickname = nickname;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nickname,first_name,last_name')
      .eq('nickname', nickname)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    lastNickname = nickname;
    lastProfile = data;
    ensureSummary(data);
  } catch (error) {
    console.warn('Profil-Kopfdaten konnten nicht geladen werden:', error?.message || error);
  } finally {
    loadingNickname = '';
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void syncSummary();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:open-profile', schedule);
window.addEventListener('ec:profile-updated', () => {
  lastNickname = '';
  lastProfile = null;
  schedule();
});
