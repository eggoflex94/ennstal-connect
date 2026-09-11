import { supabase } from './supabaseClient';

let queued = false;
let viewer = null;
let regions = new Map();
let lastProfileId = '';
let lastSignature = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatLastActive(value) {
  if (!value) return 'Unbekannt';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unbekannt';
  return d.toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).replace(',', ' ·');
}

function age(value) {
  if (!value) return '—';
  const b = new Date(`${value}T00:00:00`);
  if (Number.isNaN(b.getTime())) return '—';
  const n = new Date();
  let years = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) years -= 1;
  return years >= 0 ? `${years} Jahre` : '—';
}

function isAdminViewer() {
  const role = String(viewer?.role || '').toUpperCase();
  return role === 'HEAD_ADMIN' || role === 'ADMIN';
}

function canSee(profile, field) {
  if (!profile) return false;
  if (viewer?.id === profile.id || isAdminViewer()) return true;
  const setting = String(profile?.privacy_settings?.[field] || 'PUBLIC').toUpperCase();
  return setting !== 'PRIVATE';
}

function canSeePresence(profile) {
  return viewer?.id === profile?.id || isAdminViewer() || !profile?.hide_online_status;
}

function roleInfo(profile, regionalNames = []) {
  const role = String(profile?.role || 'MEMBER').toUpperCase();
  if (role === 'HEAD_ADMIN') return { label: 'Betreiber (Hauptadmin)', star: '/role-star-red.svg', cls: 'admin' };
  if (regionalNames.length) return { label: `Regional Admin – ${regionalNames.join(' · ')}`, star: '/supporter-star.svg', cls: 'supporter' };
  if (role === 'ADMIN') return { label: 'Community Admin', star: '/role-star-red.svg', cls: 'admin' };
  if (role === 'SUPPORTER') return { label: 'Supporter', star: '/supporter-star.svg', cls: 'supporter' };
  if (profile?.account_badge === 'BUSINESS') return { label: 'Unternehmenskonto', star: '/role-star-blue.svg', cls: 'business' };
  return { label: 'Mitglied', star: '', cls: 'member' };
}

function homeRegion(profile) {
  return regions.get(profile?.home_region_id) || profile?.home_region_name || profile?.region_name || 'Nicht festgelegt';
}

function row(label, value) {
  return `<div class="ec-restored-profile-row"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
}

function render(profile, regionalNames = []) {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const hero = page?.querySelector(':scope > .member-profile-hero');
  if (!page || !hero || !profile) return;

  const originalText = hero.querySelector(':scope > div:not(.ec-restored-profile-main)');
  if (originalText) originalText.classList.add('ec-restored-profile-original-text');

  let functionCard = hero.querySelector(':scope > .ec-restored-profile-function');
  if (!functionCard) {
    functionCard = document.createElement('section');
    functionCard.className = 'ec-restored-profile-function';
    hero.appendChild(functionCard);
  }

  let main = hero.querySelector(':scope > .ec-restored-profile-main');
  if (!main) {
    main = document.createElement('section');
    main.className = 'ec-restored-profile-main';
    hero.appendChild(main);
  }

  const role = roleInfo(profile, regionalNames);
  const region = homeRegion(profile);
  const showName = canSee(profile, 'name');
  const showBirth = canSee(profile, 'birth_date');
  const showPresence = canSeePresence(profile);
  const online = Boolean(profile?.is_online && profile?.last_active_at && Date.now() - new Date(profile.last_active_at).getTime() < 5 * 60 * 1000);
  const lastActive = profile?.last_active_at || profile?.last_seen_at;

  const signature = JSON.stringify([
    profile.id, profile.nickname, profile.first_name, profile.last_name, profile.birth_date,
    profile.role, profile.account_badge, profile.is_verified, region, regionalNames, showName, showBirth,
    profile.bio, profile.head_admin_responsibilities, profile.admin_responsibilities,
    showPresence, online, lastActive, profile.hide_online_status
  ]);
  if (signature === lastSignature && profile.id === lastProfileId) return;
  lastSignature = signature;
  lastProfileId = profile.id;

  functionCard.className = `ec-restored-profile-function role-${role.cls}`;
  functionCard.innerHTML = `
    <span class="ec-restored-profile-eyebrow">FUNKTION</span>
    <strong>${role.star ? `<img src="${role.star}" alt="" aria-hidden="true">` : ''}<span>${esc(role.label)}</span></strong>
    <small>Heimatregion: ${esc(region)}</small>
    ${showPresence ? `<div class="ec-restored-profile-presence"><b class="${online ? 'is-online' : 'is-offline'}">${online ? 'Online' : 'Offline'}</b><span>Zuletzt aktiv: ${esc(formatLastActive(lastActive))}</span></div>` : ''}`;

  const rows = [row('NICKNAME', profile.nickname || '—')];
  if (showName) {
    rows.push(row('VORNAME', profile.first_name || '—'));
    rows.push(row('NACHNAME', profile.last_name || '—'));
  }
  if (showBirth) {
    rows.push(row('GEBURTSDATUM', formatDate(profile.birth_date)));
    if (profile.birth_date) rows.push(row('ALTER', age(profile.birth_date)));
  }
  rows.push(row('HEIMATREGION', region));
  if (regionalNames.length) rows.push(row('ADMIN-REGION', regionalNames.join(' · ')));

  const responsibility = profile.role === 'HEAD_ADMIN'
    ? (profile.head_admin_responsibilities || 'Gesamtverantwortung, Sicherheit & Regeln')
    : (Array.isArray(profile.admin_responsibilities) && profile.admin_responsibilities.length ? profile.admin_responsibilities.join(' · ') : '');

  main.innerHTML = `
    <header>
      <span class="ec-restored-profile-eyebrow">MITGLIEDSPROFIL</span>
      <h1>${esc(profile.nickname || 'Mitglied')}</h1>
      ${profile.is_verified ? '<span class="ec-restored-profile-verified">✓ Verifiziert</span>' : ''}
    </header>
    <div class="ec-restored-profile-data">${rows.join('')}</div>
    ${profile.bio ? `<p class="ec-restored-profile-bio">${esc(profile.bio)}</p>` : ''}
    ${responsibility ? `<p class="ec-restored-profile-responsibility">Zuständig für: ${esc(responsibility)}</p>` : ''}`;
}

async function loadDirectoryProfile(id) {
  const { data, error } = await supabase.rpc('community_member_directory');
  if (error) throw error;
  const rows = (data || []).map((row) => typeof row === 'string' ? JSON.parse(row) : row);
  return rows.find((profile) => String(profile?.id || '') === String(id)) || null;
}

async function loadRegionalAdminNames(id) {
  const { data, error } = await supabase
    .from('regional_admin_assignments')
    .select('region_id,active')
    .eq('user_id', id)
    .eq('active', true);
  if (error) {
    console.warn('Regional-Admin-Zuweisungen konnten nicht geladen werden:', error.message);
    return [];
  }
  return [...new Set((data || []).map((assignment) => regions.get(assignment.region_id)).filter(Boolean))];
}

async function loadProfile() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const id = page?.dataset.profileId;
  if (!id) return;
  try {
    const [{ data: auth }, directoryProfile] = await Promise.all([
      supabase.auth.getUser(),
      loadDirectoryProfile(id)
    ]);
    if (!directoryProfile) return;

    if (!viewer && auth?.user) {
      const { data: viewerProfile } = await supabase.from('profiles').select('id,role').eq('id', auth.user.id).maybeSingle();
      viewer = viewerProfile || { id: auth.user.id, role: 'MEMBER' };
    }

    if (!regions.size) {
      const { data: regionRows } = await supabase.from('regions').select('id,name').eq('is_active', true);
      regions = new Map((regionRows || []).map((region) => [region.id, region.name]));
    }

    let profile = directoryProfile;
    if (isAdminViewer()) {
      const { data: protectedProfile } = await supabase
        .from('profiles')
        .select('id,first_name,last_name,birth_date,privacy_settings,head_admin_responsibilities,admin_responsibilities,hide_online_status,last_active_at,last_seen_at,is_online')
        .eq('id', id)
        .maybeSingle();
      if (protectedProfile) profile = { ...profile, ...protectedProfile };
    }

    const regionalNames = await loadRegionalAdminNames(id);
    render(profile, regionalNames);
  } catch (error) {
    console.warn('Mitgliedsprofil konnte nicht auf den ursprünglichen Aufbau gebracht werden:', error?.message || error);
  }
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    void loadProfile();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:open-profile', schedule);
window.addEventListener('ec:profile-updated', () => { lastSignature = ''; schedule(); });
