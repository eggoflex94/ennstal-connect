import { supabase } from './supabaseClient';
import './dashboard-community-realtime.js';
import './profile-visits-realtime.css';

let channel = null;
let currentUserId = null;
let refreshTimer = null;
let observedPanel = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function roleStar(profile) {
  const role = String(profile?.role || '').toUpperCase();
  if (role === 'HEAD_ADMIN' || role === 'ADMIN') return '/role-star-red.svg';
  if (role === 'SUPPORTER') return '/supporter-star.svg';
  if (profile?.account_badge === 'BUSINESS') return '/role-star-blue.svg';
  return '/role-star-member.svg';
}

function roleLabel(profile) {
  const role = String(profile?.role || '').toUpperCase();
  if (role === 'HEAD_ADMIN') return 'Hauptadmin';
  if (role === 'ADMIN') return 'Admin';
  if (role === 'SUPPORTER') return 'Supporter';
  if (profile?.account_badge === 'BUSINESS') return 'Unternehmen';
  return 'Mitglied';
}

async function refreshProfileVisits() {
  if (!currentUserId) return;
  const [{ data: visits, count: totalCount, error: visitError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from('profile_visits').select('visitor_id,visited_at', { count:'exact' }).eq('profile_id', currentUserId).order('visited_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('id,nickname,first_name,last_name,role,account_badge,avatar_url,account_status').eq('account_status', 'ACTIVE')
  ]);
  if (visitError) {
    console.warn('Profilbesuche konnten nicht synchronisiert werden:', visitError.message);
    return;
  }
  if (profileError) console.warn('Profile für Profilbesuche konnten nicht vollständig geladen werden:', profileError.message);

  const rows = visits || [];
  const people = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const count = document.querySelector('.ec-dock-visits-count');
  if (count) {
    count.textContent = String(totalCount ?? rows.length);
    count.hidden = false;
  }

  const panel = document.querySelector('.ec-dock-detail[data-panel="visits"]');
  if (!panel) return;

  panel.innerHTML = rows.length ? rows.map((row) => {
    const person = people.get(row.visitor_id);
    const name = person?.nickname || [person?.first_name, person?.last_name].filter(Boolean).join(' ') || 'Mitglied';
    const role = roleLabel(person);
    const star = roleStar(person);
    const avatar = person?.avatar_url || '/community-default-avatar.png';
    const date = row.visited_at ? new Date(row.visited_at).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '';
    const dateTime = row.visited_at ? new Date(row.visited_at).toISOString() : '';
    return `<button type="button" class="ec-dock-detail-row ec-profile-visit-row" data-profile-id="${esc(row.visitor_id)}" aria-label="Profil von ${esc(name)} öffnen">
      <img class="ec-profile-visit-avatar" src="${esc(avatar)}" alt="" loading="lazy">
      <span class="ec-profile-visit-main">
        <span class="ec-profile-visit-name"><img class="ec-profile-visit-star" src="${esc(star)}" alt="${esc(role)}"><strong>${esc(name)}</strong></span>
        <small>hat dein Profil besucht</small>
      </span>
      <time datetime="${esc(dateTime)}">${esc(date)}</time>
    </button>`;
  }).join('') : '<div class="ec-dock-empty">Noch keine Profilbesuche.</div>';

  panel.querySelectorAll('.ec-profile-visit-row').forEach((button) => {
    button.onclick = () => {
      const profileId = button.dataset.profileId;
      if (!profileId) return;
      window.dispatchEvent(new CustomEvent('ec:open-profile', { detail: { profileId } }));
      document.body.classList.remove('ec-dock-open');
    };
  });
}

function queueRefresh(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshProfileVisits, delay);
}

async function start() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  currentUserId = user.id;
  await refreshProfileVisits();
  if (channel) await supabase.removeChannel(channel);
  channel = supabase
    .channel(`profile-visits-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` }, () => queueRefresh())
    .subscribe();
}

window.addEventListener('focus', () => queueRefresh(0), { passive: true });
window.addEventListener('pageshow', () => queueRefresh(0), { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) queueRefresh(0); });
new MutationObserver(() => {
  const panel = document.querySelector('.ec-dock-detail[data-panel="visits"]');
  if (panel === observedPanel) return;
  observedPanel = panel;
  if (panel) queueRefresh(120);
}).observe(document.documentElement, { childList: true, subtree: true });

void start();
