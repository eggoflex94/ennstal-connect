import { supabase } from './supabaseClient';
import './dashboard-community-realtime.js';
import './profile-visits-realtime.css';

let channel = null;
let currentUserId = null;
let refreshTimer = null;

function emitProfileVisitsChanged(reason = 'refresh') {
  window.dispatchEvent(new CustomEvent('ec:profile-visits-changed', {
    detail: { userId: currentUserId, reason, at: Date.now() }
  }));
}

function queueRefresh(delay = 80, reason = 'refresh') {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => emitProfileVisitsChanged(reason), delay);
}

async function start() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  currentUserId = user.id;

  if (channel) await supabase.removeChannel(channel);
  channel = supabase
    .channel(`profile-visits-${user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` },
      () => queueRefresh(40, 'realtime')
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') queueRefresh(0, 'subscribed');
    });

  queueRefresh(0, 'start');
}

window.addEventListener('focus', () => queueRefresh(0, 'focus'), { passive: true });
window.addEventListener('pageshow', () => queueRefresh(0, 'pageshow'), { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) queueRefresh(0, 'visible');
});

supabase?.auth?.onAuthStateChange?.((_event, session) => {
  const nextId = session?.user?.id || null;
  if (nextId && nextId !== currentUserId) {
    currentUserId = nextId;
    void start();
  }
});

void start();
