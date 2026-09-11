import { supabase } from './supabaseClient';

let queued = false;
let lastNickname = '';
let lastProfile = null;
let loadingNickname = '';
let viewer = null;
let viewerLoaded = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatBirthDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function birthDateVisible(profile) {
  if (!profile?.birth_date) return false;
  if (viewer?.id === profile.id) return true;
  const role = String(viewer?.role || '').toUpperCase();
  if (role === 'HEAD_ADMIN' || role === 'ADMIN') return true;
  const setting = String(profile?.privacy_settings?.birth_date || 'PUBLIC').toUpperCase();
  return setting !== 'PRIVATE';
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

  const showBirthDate = birthDateVisible(profile);
  const signature = JSON.stringify([
    profile.nickname || '',
    profile.first_name || '',
    profile.last_name || '',
    showBirthDate ? profile.birth_date || '' : 'private',
    viewer?.role || '',
    viewer?.id || ''
  ]);
  if (summary.dataset.signature === signature) return;
  summary.dataset.signature = signature;
  summary.innerHTML = `
    <div class="ec-profile-identity-card"><span>NICKNAME</span><strong>${esc(profile.nickname || '—')}</strong></div>
    <div class="ec-profile-identity-card"><span>VORNAME</span><strong>${esc(profile.first_name || '—')}</strong></div>
    <div class="ec-profile-identity-card"><span>NACHNAME</span><strong>${esc(profile.last_name || '—')}</strong></div>
    ${showBirthDate ? `<div class="ec-profile-identity-card"><span>GEBURTSDATUM</span><strong>${esc(formatBirthDate(profile.birth_date))}</strong></div>` : ''}`;
}

async function loadViewer() {
  if (viewerLoaded) return viewer;
  viewerLoaded = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
    viewer = data || { id: user.id, role: 'MEMBER' };
  } catch (error) {
    console.warn('Profilbetrachter konnte nicht geladen werden:', error?.message || error);
  }
  return viewer;
}

async function syncSummary() {
  const title = document.querySelector('.profile-view.integrated-profile-view .integrated-profile-title h1');
  const nickname = String(title?.textContent || '').trim();
  if (!nickname) return;

  await loadViewer();

  if (lastNickname === nickname && lastProfile) {
    ensureSummary(lastProfile);
    return;
  }
  if (loadingNickname === nickname) return;
  loadingNickname = nickname;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nickname,first_name,last_name,birth_date,privacy_settings')
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
window.addEventListener('ec:navigate', schedule);
window.addEventListener('ec:profile-updated', () => {
  lastNickname = '';
  lastProfile = null;
  schedule();
});
