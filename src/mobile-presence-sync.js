import { supabase } from './supabaseClient';

let lastSentAt = 0;
let sending = false;
const MIN_INTERVAL = 55_000;

function deviceType() {
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const narrow = window.matchMedia?.('(max-width: 820px)')?.matches;
  const ua = String(navigator.userAgent || '');
  return coarse || narrow || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'MOBILE' : 'DESKTOP';
}

async function touchPresence(force = false) {
  if (!supabase || sending || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (!force && now - lastSentAt < MIN_INTERVAL) return;
  sending = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { error } = await supabase.rpc('ec_touch_presence', { p_device: deviceType() });
    if (!error) lastSentAt = Date.now();
    else console.warn('Geräte-Online-Status konnte nicht aktualisiert werden:', error.message);
  } catch (error) {
    console.warn('Geräte-Online-Status konnte nicht aktualisiert werden:', error?.message || error);
  } finally {
    sending = false;
  }
}

const activity = () => void touchPresence(false);
['pointerdown','touchstart','keydown'].forEach((type) => window.addEventListener(type, activity, { passive: true }));
window.addEventListener('focus', () => void touchPresence(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void touchPresence(true); });
window.setInterval(() => void touchPresence(false), 60_000);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void touchPresence(true), { once: true });
else void touchPresence(true);
