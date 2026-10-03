import { supabase } from './supabaseClient';
import './dashboard-community-realtime.js';
import './profile-visits-realtime.css';

let channel = null;
let currentUserId = null;
let currentAccessToken = '';
let refreshTimer = null;
let restartTimer = null;
let pollTimer = null;
let startPromise = null;

function emitProfileVisitsChanged(reason = 'refresh', visit = null) {
  if (!currentUserId) return;
  window.dispatchEvent(new CustomEvent('ec:profile-visits-changed', {
    detail: { userId: currentUserId, reason, visit, at: Date.now() }
  }));
}

function queueRefresh(delay = 0, reason = 'refresh', visit = null) {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => emitProfileVisitsChanged(reason, visit), delay);
}

function startFallbackPolling() {
  clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    if (!document.hidden && currentUserId) queueRefresh(0, 'fallback-poll');
  }, 8000);
}

function scheduleRestart(delay = 700) {
  clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    if (!document.hidden) void start({ force: true });
  }, delay);
}

async function setRealtimeAuth(session) {
  const token = session?.access_token || '';
  if (!token) return false;
  if (token !== currentAccessToken) {
    supabase.realtime.setAuth(token);
    currentAccessToken = token;
  }
  return true;
}

async function start({ force = false } = {}) {
  if (startPromise && !force) return startPromise;

  startPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user?.id || !(await setRealtimeAuth(session))) return;

    currentUserId = user.id;
    clearTimeout(restartTimer);

    if (channel) {
      const previous = channel;
      channel = null;
      await supabase.removeChannel(previous);
    }

    const nextChannel = supabase
      .channel(`profile-visits-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` },
        (payload) => {
          const visit = payload?.new || null;
          if (visit?.profile_id && visit.profile_id !== user.id) return;
          queueRefresh(0, 'realtime-insert', visit);
        }
      );

    channel = nextChannel;
    nextChannel.subscribe((status, error) => {
      if (channel !== nextChannel) return;
      if (status === 'SUBSCRIBED') {
        clearTimeout(restartTimer);
        queueRefresh(0, 'realtime-subscribed');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('Profilbesuche-Realtime getrennt:', status, error?.message || '');
        channel = null;
        scheduleRestart(status === 'TIMED_OUT' ? 1200 : 700);
      }
    });

    startFallbackPolling();
    queueRefresh(0, 'realtime-start');
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

window.addEventListener('focus', () => {
  queueRefresh(0, 'focus');
  if (!channel && currentUserId) scheduleRestart(0);
}, { passive: true });

window.addEventListener('pageshow', () => {
  queueRefresh(0, 'pageshow');
  if (!channel) scheduleRestart(0);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    queueRefresh(0, 'visible');
    if (!channel) scheduleRestart(0);
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id || null;

  if (!nextUserId) {
    currentUserId = null;
    currentAccessToken = '';
    clearInterval(pollTimer);
    clearTimeout(restartTimer);
    if (channel) {
      const previous = channel;
      channel = null;
      void supabase.removeChannel(previous);
    }
    return;
  }

  void setRealtimeAuth(session).then(() => {
    if (nextUserId !== currentUserId || !channel) void start({ force: true });
    else queueRefresh(0, 'auth-refresh');
  });
});

void start();
