import { supabase } from './supabaseClient';
import './dashboard-community-realtime.js';

let channel = null;
let currentUserId = null;
let refreshTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function refreshProfileVisits() {
  if (!currentUserId) return;
  const [{ data: visits, count: totalCount, error: visitError }, { data: profiles }] = await Promise.all([
    supabase.from('profile_visits').select('visitor_id,visited_at', { count:'exact' }).eq('profile_id', currentUserId).order('visited_at', { ascending: false }).limit(10),
    supabase.from('profiles').select('id,nickname,role,account_badge').eq('account_status', 'ACTIVE')
  ]);
  if (visitError) {
    console.warn('Profilbesuche konnten nicht synchronisiert werden:', visitError.message);
    return;
  }
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
    const name = person?.nickname || 'Mitglied';
    const date = row.visited_at ? new Date(row.visited_at).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    return `<button type="button" class="ec-dock-detail-row" data-profile-id="${esc(row.visitor_id)}"><span><strong>${esc(name)}</strong><small>hat dein Profil besucht</small></span><time>${esc(date)}</time></button>`;
  }).join('') : '<div class="ec-dock-empty">Noch keine Einträge.</div>';
  panel.querySelectorAll('.ec-dock-detail-row').forEach((button) => {
    button.onclick = () => {
      const profileId = button.dataset.profileId;
      if (profileId) window.dispatchEvent(new CustomEvent('ec:open-profile', { detail: { profileId } }));
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
  if (document.querySelector('.ec-dock-detail[data-panel="visits"]')) queueRefresh(120);
}).observe(document.documentElement, { childList: true, subtree: true });

void start();
