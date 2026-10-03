import { supabase } from './supabaseClient';
import './dashboard-community-realtime.js';
import './profile-visits-realtime.css';

let channel = null;
let currentUserId = null;
let refreshTimer = null;
let pollTimer = null;
let restartTimer = null;

function emitProfileVisitsChanged(reason = 'refresh') {
  if (!currentUserId) return;
  window.dispatchEvent(new CustomEvent('ec:profile-visits-changed', {
    detail: { userId: currentUserId, reason, at: Date.now() }
  }));
}

function queueRefresh(delay = 80, reason = 'refresh') {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => emitProfileVisitsChanged(reason), delay);
}

function scheduleRestart(delay = 1200) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (currentUserId && !document.hidden) void start();
  }, delay);
}

function startFallbackPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (!document.hidden && currentUserId) queueRefresh(0, 'poll');
  }, 15000);
}

async function start() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  currentUserId = user.id;

  clearTimeout(restartTimer);
  if (channel) {
    const previousChannel = channel;
    channel = null;
    await supabase.removeChannel(previousChannel);
  }

  const nextChannel = supabase
    .channel(`profile-visits-${user.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profile_visits', filter: `profile_id=eq.${user.id}` },
      () => queueRefresh(25, 'realtime')
    );

  channel = nextChannel;
  nextChannel.subscribe((status) => {
    // Ignore lifecycle callbacks from a channel that has already been replaced.
    if (channel !== nextChannel) return;
    if (status === 'SUBSCRIBED') {
      clearTimeout(restartTimer);
      queueRefresh(0, 'subscribed');
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      channel = null;
      scheduleRestart();
    }
  });

  startFallbackPolling();
  queueRefresh(0, 'start');
}

window.addEventListener('focus', () => {
  queueRefresh(0, 'focus');
  if (!channel && currentUserId) scheduleRestart(0);
}, { passive: true });

window.addEventListener('pageshow', () => {
  queueRefresh(0, 'pageshow');
  if (currentUserId && !channel) scheduleRestart(0);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    queueRefresh(0, 'visible');
    if (currentUserId && !channel) scheduleRestart(0);
  }
});

supabase?.auth?.onAuthStateChange?.((_event, session) => {
  const nextId = session?.user?.id || null;
  if (!nextId) {
    currentUserId = null;
    clearInterval(pollTimer);
    clearTimeout(restartTimer);
    if (channel) {
      const previousChannel = channel;
      channel = null;
      void supabase.removeChannel(previousChannel);
    }
    return;
  }
  if (nextId !== currentUserId) {
    currentUserId = nextId;
    void start();
  } else {
    queueRefresh(0, 'auth');
  }
});

void start();
