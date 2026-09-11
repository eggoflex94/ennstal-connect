import { supabase } from './supabaseClient';

let queued = false;
let lastNickname = '';
let lastProfile = null;
let loadingNickname = '';
let viewer = null;
let viewerLoaded = false;
let regionNames = new Map();
let regionsLoaded = false;

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

function ageFromBirthDate(value) {
  if (!value) return '—';
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '—';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? `${age} Jahre` : '—';
}

function isAdminViewer() {
  const role = String(viewer?.role || '').toUpperCase();
  return role === 'HEAD_ADMIN' || role === 'ADMIN';
}

function privacyAllows(profile, field) {
  if (viewer?.id === profile?.id || isAdminViewer()) return true;
  const setting = String(profile?.privacy_settings?.[field] || 'PUBLIC').toUpperCase();
  return setting !== 'PRIVATE';
}

function homeRegionName(profile) {
  return regionNames.get(profile?.home_region_id) || profile?.home_region || profile?.region_name || 'Nicht festgelegt';
}

function card(label, value) {
  return `<div class="ec-profile-identity-card"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
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

  const showName = privacyAllows(profile, 'name');
  const showBirthDate = Boolean(profile.birth_date) && privacyAllows(profile, 'birth_date');
  const region = homeRegionName(profile);
  const signature = JSON.stringify([
    profile.nickname || '',
    showName ? profile.first_name || '' : 'private',
    showName ? profile.last_name || '' : 'private',
    showBirthDate ? profile.birth_date || '' : 'private',
    region,
    viewer?.role || '',
    viewer?.id || ''
  ]);
  if (summary.dataset.signature === signature) return;
  summary.dataset.signature = signature;

  const parts = [card('NICKNAME', profile.nickname || '—')];
  if (showName) {
    parts.push(card('VORNAME', profile.first_name || '—'));
    parts.push(card('NACHNAME', profile.last_name || '—'));
  }
  if (showBirthDate) {
    parts.push(card('GEBURTSDATUM', formatBirthDate(profile.birth_date)));
    parts.push(card('ALTER', ageFromBirthDate(profile.birth_date)));
  }
  parts.push(card('HEIMATREGION', region));
  summary.innerHTML = parts.join('');
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

async function loadRegions() {
  if (regionsLoaded) return;
  regionsLoaded = true;
  try {
    const { data, error } = await supabase.from('regions').select('id,name').eq('is_active', true);
    if (error) throw error;
    regionNames = new Map((data || []).map((region) => [region.id, region.name]));
  } catch (error) {
    console.warn('Heimatregionen konnten nicht geladen werden:', error?.message || error);
  }
}

async function syncSummary() {
  const title = document.querySelector('.profile-view.integrated-profile-view .integrated-profile-title h1');
  const nickname = String(title?.textContent || '').trim();
  if (!nickname) return;

  await Promise.all([loadViewer(), loadRegions()]);

  if (lastNickname === nickname && lastProfile) {
    ensureSummary(lastProfile);
    return;
  }
  if (loadingNickname === nickname) return;
  loadingNickname = nickname;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,nickname,first_name,last_name,birth_date,home_region_id,privacy_settings')
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
