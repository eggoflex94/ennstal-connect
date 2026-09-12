import { supabase } from './supabaseClient';

let currentProfileId = '';
let channel = null;
let timer = null;
let scheduled = false;
const FIVE_MINUTES = 5 * 60 * 1000;

function onlineNow(row) {
  return Boolean(row?.is_online && row?.last_active_at && Date.now() - new Date(row.last_active_at).getTime() < FIVE_MINUTES);
}
function statusText(row) {
  if (!onlineNow(row)) return 'Offline';
  return String(row?.presence_device || '').toUpperCase() === 'MOBILE' ? 'Mobil online' : 'Online';
}
function statusClass(row) {
  if (!onlineNow(row)) return 'offline';
  return String(row?.presence_device || '').toUpperCase() === 'MOBILE' ? 'mobile-online' : 'online';
}
function lastSeenText(row) {
  if (!row?.last_active_at || onlineNow(row)) return '';
  try { return `Zuletzt aktiv: ${new Date(row.last_active_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}`; }
  catch { return ''; }
}
function ensureCard(page) {
  let card = page.querySelector('.ec-live-profile-presence');
  if (card) return card;
  card = document.createElement('div');
  card.className = 'ec-live-profile-presence';
  card.innerHTML = '<strong></strong><small></small>';
  const hero = page.querySelector('.member-profile-hero');
  if (hero) hero.appendChild(card); else page.prepend(card);
  return card;
}
function updateLegacyPresence(page, row) {
  const status = statusText(row);
  const lastSeen = lastSeenText(row);
  let foundStatus = false;
  [...page.querySelectorAll('*')].forEach((node) => {
    if (!(node instanceof HTMLElement) || node.closest('.ec-live-profile-presence') || node.children.length) return;
    const text = String(node.textContent || '').trim();
    if (/^(Mobil online|Online|Offline)$/i.test(text)) {
      node.textContent = status;
      node.classList.toggle('ec-mobile-online-label', status === 'Mobil online');
      node.classList.toggle('ec-online-label', status === 'Online');
      node.classList.toggle('ec-offline-label', status === 'Offline');
      foundStatus = true;
      return;
    }
    if (/^Zuletzt aktiv:/i.test(text)) {
      node.textContent = lastSeen;
      node.hidden = !lastSeen;
    }
  });
  return foundStatus;
}
function render(row) {
  const page = document.querySelector(`.member-profile-page[data-profile-id="${CSS.escape(row?.id || '')}"]`);
  if (!page) return;
  if (row.hide_online_status) {
    page.querySelector('.ec-live-profile-presence')?.remove();
    return;
  }
  const legacyUpdated = updateLegacyPresence(page, row);
  if (legacyUpdated) {
    page.querySelector('.ec-live-profile-presence')?.remove();
    return;
  }
  const card = ensureCard(page);
  card.className = `ec-live-profile-presence ${statusClass(row)}`;
  card.querySelector('strong').textContent = statusText(row);
  const copy = lastSeenText(row);
  const small = card.querySelector('small');
  small.textContent = copy;
  small.hidden = !copy;
}
async function load(profileId) {
  if (!profileId || !supabase) return;
  const { data, error } = await supabase.from('profiles').select('id,is_online,last_active_at,presence_device,hide_online_status').eq('id', profileId).maybeSingle();
  if (error || !data || profileId !== currentProfileId) return;
  render(data);
}
function subscribe(profileId) {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  if (!profileId) return;
  channel = supabase.channel(`ec-profile-presence-${profileId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profileId}` }, (payload) => render(payload.new))
    .subscribe();
}
function syncProfile() {
  scheduled = false;
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  const profileId = page?.dataset.profileId || '';
  if (!profileId) {
    currentProfileId = '';
    if (channel) { supabase.removeChannel(channel); channel = null; }
    return;
  }
  if (profileId !== currentProfileId) {
    currentProfileId = profileId;
    subscribe(profileId);
  }
  void load(profileId);
}
function schedule(delay = 30) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncProfile);
  }, delay);
}
window.addEventListener('ec:navigate', () => schedule(20));
window.addEventListener('focus', () => schedule(20));
window.addEventListener('ec:presence-device', () => schedule(20));
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(20); });
window.setInterval(() => { if (currentProfileId) void load(currentProfileId); }, 60_000);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
