import { supabase } from './supabaseClient';

const PANEL_ID = 'ec-member-suggestions';
let activeRegion = null;
let refreshTimer = null;
let requestVersion = 0;

const clean = (value) => String(value ?? '').trim();
const interestsOf = (value) => {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  if (!value) return [];
  return clean(value).split(',').map(clean).filter(Boolean);
};
const normalize = (value) => clean(value).toLocaleLowerCase('de-AT');
const displayName = (member) => clean(member?.nickname || member?.first_name || 'Mitglied');

function currentRegionSlug() {
  const picker = document.querySelector('.ec-region-picker select');
  return clean(picker?.value || localStorage.getItem('ec-active-region'));
}

async function resolveRegion() {
  if (activeRegion?.id) return activeRegion;
  if (!supabase) return null;
  const slug = currentRegionSlug();
  if (!slug) return null;
  const { data } = await supabase.from('regions').select('id,name,slug').eq('slug', slug).maybeSingle();
  return data || null;
}

function commonInterests(memberInterests, ownInterests) {
  const mine = new Set(ownInterests.map(normalize));
  return memberInterests.filter((interest) => mine.has(normalize(interest)));
}

function openProfile(member) {
  window.dispatchEvent(new CustomEvent('ec:open-profile', {
    detail: { profileId: member.id, nickname: displayName(member) },
    cancelable: true,
  }));
}

function openMembers() {
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'members' } }));
}

function memberCard(member, shared) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ec-member-suggestion';
  button.addEventListener('click', () => openProfile(member));

  if (member.avatar_url) {
    const image = document.createElement('img');
    image.src = member.avatar_url;
    image.alt = '';
    button.appendChild(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'ec-member-suggestion-avatar-fallback';
    fallback.textContent = displayName(member).slice(0, 1).toUpperCase() || '•';
    button.appendChild(fallback);
  }

  const copy = document.createElement('span');
  copy.className = 'ec-member-suggestion-copy';
  const name = document.createElement('strong');
  name.textContent = displayName(member);
  const location = document.createElement('small');
  location.textContent = clean(member.location) || 'Aus deiner Region';
  copy.append(name, location);

  if (shared.length) {
    const tags = document.createElement('span');
    tags.className = 'ec-member-suggestion-tags';
    shared.slice(0, 3).forEach((interest) => {
      const tag = document.createElement('span');
      tag.textContent = interest;
      tags.appendChild(tag);
    });
    copy.appendChild(tags);
  }

  const action = document.createElement('em');
  action.textContent = shared.length ? `${shared.length} gemeinsame${shared.length === 1 ? 's' : ''} Interesse${shared.length === 1 ? '' : 'n'} · Profil ansehen →` : 'Profil ansehen →';
  copy.appendChild(action);
  button.appendChild(copy);
  return button;
}

function renderPanel(region, suggestions) {
  const activation = document.getElementById('ec-home-activation');
  if (!activation) return false;
  document.getElementById(PANEL_ID)?.remove();

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.className = 'ec-member-suggestions';
  const head = document.createElement('div');
  head.className = 'ec-member-suggestions-head';
  const intro = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'FÜR DICH';
  const title = document.createElement('h2');
  title.textContent = 'Menschen, die du kennenlernen könntest';
  const subtitle = document.createElement('p');
  subtitle.textContent = `Aus ${clean(region.name)} – bevorzugt nach gemeinsamen Interessen.`;
  intro.append(eyebrow, title, subtitle);
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'ec-member-suggestions-all';
  all.textContent = 'Alle Mitglieder →';
  all.addEventListener('click', openMembers);
  head.append(intro, all);
  panel.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'ec-member-suggestions-grid';
  suggestions.forEach(({ member, shared }) => grid.appendChild(memberCard(member, shared)));
  panel.appendChild(grid);

  const today = activation.querySelector('.ec-today-region');
  if (today) today.after(panel);
  else activation.appendChild(panel);
  return true;
}

async function refreshSuggestions() {
  const version = ++requestVersion;
  if (!supabase || !document.querySelector('.home-page')) return;
  const region = await resolveRegion();
  if (!region?.id || version !== requestVersion) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id || version !== requestVersion) return;

  const [profileResult, directoryResult, friendshipsResult] = await Promise.all([
    supabase.from('profiles').select('interests,home_region_id').eq('id', user.id).maybeSingle(),
    supabase.rpc('community_member_directory'),
    supabase.from('friendships').select('requester_id,receiver_id,status').or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`),
  ]);
  if (version !== requestVersion) return;

  const ownInterests = interestsOf(profileResult.data?.interests);
  const connectedIds = new Set([user.id]);
  (friendshipsResult.data || []).forEach((friendship) => {
    if (friendship.status === 'ACCEPTED' || friendship.status === 'PENDING') {
      connectedIds.add(friendship.requester_id === user.id ? friendship.receiver_id : friendship.requester_id);
    }
  });

  const members = (directoryResult.data || [])
    .map((row) => typeof row === 'string' ? JSON.parse(row) : row)
    .filter((member) => member?.id && member.home_region_id === region.id && !connectedIds.has(member.id) && member.account_status !== 'SUSPENDED' && !member.is_test_account);

  const ranked = members.map((member) => {
    const shared = commonInterests(interestsOf(member.interests), ownInterests);
    return { member, shared, score: shared.length };
  }).sort((a, b) => b.score - a.score || displayName(a.member).localeCompare(displayName(b.member), 'de-AT'));

  if (!ranked.length) {
    document.getElementById(PANEL_ID)?.remove();
    return;
  }
  renderPanel(region, ranked.slice(0, 3));
}

function scheduleRefresh(delay = 180) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refreshSuggestions(), delay);
}

window.addEventListener('ec:region-change', (event) => {
  activeRegion = event.detail || null;
  scheduleRefresh();
});
window.addEventListener('ec:navigate', () => scheduleRefresh(220));
window.addEventListener('popstate', () => scheduleRefresh(220));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scheduleRefresh(300), { once: true });
else scheduleRefresh(300);
window.setTimeout(() => scheduleRefresh(0), 900);
window.setTimeout(() => scheduleRefresh(0), 1800);
