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
let channelSequence = 0;

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
  }, 60000);
}

function scheduleRestart(delay = 700) {
  clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    if (!document.hidden) void ensureRealtimeChannel();
  }, delay);
}

async function setRealtimeAuth(session) {
  const token = session?.access_token || '';
  if (!token) return false;
  if (token !== currentAccessToken) {
    await supabase.realtime.setAuth(token);
    currentAccessToken = token;
  }
  return true;
}

async function stopCurrentChannel() {
  if (!channel) return;
  const previous = channel;
  channel = null;
  try {
    await supabase.removeChannel(previous);
  } catch (error) {
    console.warn('Profilbesuche-Realtime Kanal konnte nicht sauber entfernt werden:', error?.message || error);
  }
}

async function ensureRealtimeChannel() {
  // Never run two channel setup sequences at the same time. Supabase Realtime
  // forbids adding postgres_changes callbacks after a channel has subscribed,
  // which can happen when auth/focus/visibility restarts race each other.
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user?.id || !(await setRealtimeAuth(session))) return;

    currentUserId = user.id;
    clearTimeout(restartTimer);

    await stopCurrentChannel();

    const topic = `profile-visits-${user.id}-${++channelSequence}`;
    const nextChannel = supabase.channel(topic);

    // Register INSERT and UPDATE explicitly before subscribe().
    // A first visit is an INSERT; repeat visits update visited_at on the same
    // profile/visitor row. Both must reach the profile owner immediately.
    const handleVisitChange = (eventType) => (payload) => {
      const visit = payload?.new || null;
      if (!visit?.profile_id || visit.profile_id !== user.id) return;
      window.dispatchEvent(new CustomEvent('ec:profile-visits-changed', {
        detail: { userId: user.id, reason: 'realtime', eventType, visit, at: Date.now() }
      }));
    };

    nextChannel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` },
        handleVisitChange('INSERT')
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` },
        handleVisitChange('UPDATE')
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
        if (channel === nextChannel) channel = null;
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

function refreshAndEnsure(reason) {
  queueRefresh(0, reason);
  if (!channel) scheduleRestart(0);
}

window.addEventListener('focus', () => refreshAndEnsure('focus'), { passive: true });
window.addEventListener('pageshow', () => refreshAndEnsure('pageshow'), { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshAndEnsure('visible');
});

supabase.auth.onAuthStateChange((_event, session) => {
  const nextUserId = session?.user?.id || null;

  if (!nextUserId) {
    currentUserId = null;
    currentAccessToken = '';
    clearInterval(pollTimer);
    clearTimeout(restartTimer);
    void stopCurrentChannel();
    return;
  }

  // Token refreshes update Realtime auth, but channel construction remains
  // serialized through ensureRealtimeChannel().
  void setRealtimeAuth(session).then(() => {
    if (nextUserId !== currentUserId || !channel) void ensureRealtimeChannel();
    else queueRefresh(0, 'auth-refresh');
  });
});

void ensureRealtimeChannel();
