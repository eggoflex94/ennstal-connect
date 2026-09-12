import { supabase } from './supabaseClient';
import './profile-live-presence.js';
import './profile-live-presence.css';

let lastSentAt = 0;
let sending = false;
const MIN_INTERVAL = 55_000;

function deviceType() {
  const ua = String(navigator.userAgent || '');
  const uaDataMobile = navigator.userAgentData?.mobile === true;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches === true;
  const noHoverCoarse = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches === true;
  const shortSide = Math.min(Number(screen?.width || 0), Number(screen?.height || 0));
  const touchSizedDevice = touchPoints > 0 && shortSide > 0 && shortSide <= 1100;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS/i.test(ua);
  return uaDataMobile || mobileUa || noHoverCoarse || (coarse && touchPoints > 0) || touchSizedDevice ? 'MOBILE' : 'DESKTOP';
}

async function touchPresence(force = false) {
  if (!supabase || sending || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (!force && now - lastSentAt < MIN_INTERVAL) return;
  sending = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const device = deviceType();
    const { error } = await supabase.rpc('ec_touch_presence', { p_device: device });
    if (!error) {
      lastSentAt = Date.now();
      document.documentElement.dataset.ecPresenceDevice = device;
      window.dispatchEvent(new CustomEvent('ec:presence-device', { detail: { device } }));
    } else console.warn('Geräte-Online-Status konnte nicht aktualisiert werden:', error.message);
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
