import { supabase } from './supabaseClient';

let currentUserId = null;
let refreshTimer = null;
let channel = null;
let cachedFeed = [];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (value) => value ? new Date(value).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';

function ensureCard() {
  const dock = document.querySelector('.ec-right-dock');
  if (!dock) return null;
  let card = dock.querySelector('.ec-friends-newsfeed');
  if (card) return card;
  card = document.createElement('section');
  card.className = 'ec-friends-newsfeed';
  card.innerHTML = `<div class="ec-friends-newsfeed-head"><div><span>FREUNDE</span><strong>Newsfeed</strong></div><button type="button" class="ec-friends-newsfeed-refresh" aria-label="Newsfeed aktualisieren" title="Aktualisieren">↻</button></div><div class="ec-friends-newsfeed-list"><div class="ec-friends-newsfeed-empty">Newsfeed wird geladen …</div></div><button type="button" class="ec-friends-newsfeed-more">Alle Aktivitäten ansehen →</button>`;
  const adminSlot = dock.querySelector('.ec-dock-admin-slot');
  if (adminSlot) adminSlot.insertAdjacentElement('beforebegin', card); else dock.appendChild(card);
  card.querySelector('.ec-friends-newsfeed-refresh').onclick = () => queueRefresh(0);
  card.querySelector('.ec-friends-newsfeed-more').onclick = () => {
    window.dispatchEvent(new CustomEvent('ec:navigate', { detail:{ page:'home' } }));
    setTimeout(() => document.querySelector('.ec-friend-feed')?.scrollIntoView({ behavior:'smooth', block:'start' }), 120);
  };
  return card;
}

function rowMarkup(row) {
  const event = row.event_title ? `<small class="ec-friends-newsfeed-event">▣ ${esc(row.event_title)}</small>` : '';
  return `<button type="button" class="ec-friends-newsfeed-row" data-profile-id="${esc(row.author_id)}"><span class="ec-friends-newsfeed-icon" aria-hidden="true">${row.kind === 'EVENT_SHARE' ? '▣' : '●'}</span><span class="ec-friends-newsfeed-copy"><strong>${esc(row.nickname || 'Mitglied')}</strong><span>${esc(row.content)}</span>${event}<time>${esc(fmt(row.created_at))}</time></span></button>`;
}

function profileRowMarkup(row) {
  return `<article class="ec-profile-newsfeed-row"><div><strong>${esc(row.nickname || 'Mitglied')}</strong><time>${esc(fmt(row.created_at))}</time></div><p>${esc(row.content)}</p>${row.event_title ? `<small>▣ ${esc(row.event_title)}</small>` : ''}</article>`;
}

async function mountProfileFeed() {
  const roots = [...document.querySelectorAll('[data-profile-id]')].filter((node) => node.querySelector?.(':scope > .ec-clean-profile'));
  for (const root of roots) {
    const profileId = root.dataset.profileId;
    if (!profileId || profileId === currentUserId) continue;
    const { data: friendship } = await supabase.from('friendships').select('id').eq('status','ACCEPTED').or(`and(requester_id.eq.${currentUserId},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${currentUserId})`).limit(1);
    const existing = root.querySelector(':scope > .ec-profile-friends-newsfeed');
    if (!friendship?.length) { existing?.remove(); continue; }
    let section = existing;
    if (!section) {
      section = document.createElement('section');
      section.className = 'ec-profile-friends-newsfeed';
      const clean = root.querySelector(':scope > .ec-clean-profile');
      clean?.insertAdjacentElement('afterend', section);
    }
    const rows = cachedFeed.filter((row) => row.author_id === profileId && row.visibility === 'FRIENDS').slice(0,6);
    const nickname = rows[0]?.nickname || root.querySelector('.ec-clean-profile-main h1')?.textContent?.trim() || 'Dieses Mitglied';
    section.innerHTML = `<div class="ec-profile-newsfeed-head"><span>FREUNDE</span><h2>Newsfeed</h2><p>Aktivitäten, die ${esc(nickname)} mit Freunden teilt.</p></div><div class="ec-profile-newsfeed-list">${rows.length ? rows.map(profileRowMarkup).join('') : '<div class="ec-friends-newsfeed-empty">Noch keine geteilten Aktivitäten.</div>'}</div>`;
  }
}

async function refresh() {
  if (!currentUserId) return;
  const card = ensureCard();
  if (!card) return;
  const picker = document.querySelector('.ec-region-picker select');
  const slug = picker?.value || localStorage.getItem('ec-active-region');
  const { data: regions } = await supabase.from('regions').select('id,slug').eq('is_active', true);
  const regionId = (regions || []).find((region) => region.slug === slug)?.id || null;
  const { data, error } = await supabase.rpc('ec_activity_feed', { p_region: regionId });
  const list = card.querySelector('.ec-friends-newsfeed-list');
  if (error) { list.innerHTML = '<div class="ec-friends-newsfeed-empty">Newsfeed konnte nicht geladen werden.</div>'; return; }
  cachedFeed = data || [];
  const rows = cachedFeed.filter((row) => row.visibility === 'FRIENDS' && !row.is_mine).slice(0, 5);
  list.innerHTML = rows.length ? rows.map(rowMarkup).join('') : '<div class="ec-friends-newsfeed-empty">Noch keine neuen Aktivitäten deiner Freunde.</div>';
  list.querySelectorAll('.ec-friends-newsfeed-row').forEach((button) => {
    button.onclick = () => { const profileId = button.dataset.profileId; if (profileId) window.dispatchEvent(new CustomEvent('ec:open-profile', { detail:{ profileId } })); };
  });
  await mountProfileFeed();
}

function queueRefresh(delay = 120) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => void refresh(), delay); }

async function start() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  currentUserId = user.id;
  ensureCard();
  await refresh();
  if (channel) await supabase.removeChannel(channel);
  channel = supabase.channel(`friends-newsfeed-${user.id}`)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'community_activities' }, () => queueRefresh(80))
    .on('postgres_changes', { event:'DELETE', schema:'public', table:'community_activities' }, () => queueRefresh(80))
    .subscribe();
}

window.addEventListener('ec:region-change', () => queueRefresh(80));
window.addEventListener('focus', () => queueRefresh(80), { passive:true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) queueRefresh(80); });
new MutationObserver(() => {
  if (document.querySelector('.ec-right-dock') && !document.querySelector('.ec-friends-newsfeed')) ensureCard();
  if (document.querySelector('[data-profile-id] > .ec-clean-profile')) queueRefresh(80);
}).observe(document.documentElement, { childList:true, subtree:true });

void start();
