import { supabase } from './supabaseClient';
import './compact-pro-layout.css';

let currentUserId = null;
let currentPreference = 'standard';
let applying = false;
let retryTimer = null;

function applyLayout(value) {
  const app = document.querySelector('.app');
  if (!app) return false;
  app.classList.toggle('layout-compact-pro', value === 'compact-pro');
  document.documentElement.dataset.ecDensity = value === 'compact-pro' ? 'compact-pro' : 'standard';
  return true;
}

function ensureOption(select) {
  if (!select) return;
  let option = [...select.options].find((item) => item.value === 'compact-pro');
  if (!option) {
    option = document.createElement('option');
    option.value = 'compact-pro';
    option.textContent = 'Kompakt Pro – mehr Inhalt auf einen Blick';
    select.appendChild(option);
  }
  if (currentPreference === 'compact-pro' && select.value !== 'compact-pro') select.value = 'compact-pro';
  if (select.dataset.ecCompactProBound === '1') return;
  select.dataset.ecCompactProBound = '1';
  select.addEventListener('change', () => {
    if (select.value === 'compact-pro') applyLayout('compact-pro');
    else applyLayout(select.value);
  });
}

function enhanceControls() {
  document.querySelectorAll('select[name="profile_layout"]').forEach(ensureOption);
}

async function loadPreference(force = false) {
  if (applying || !supabase) return;
  applying = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!force && currentUserId === user.id) {
      applyLayout(currentPreference);
      enhanceControls();
      return;
    }
    const { data, error } = await supabase.from('profiles').select('profile_layout').eq('id', user.id).maybeSingle();
    if (error) throw error;
    currentUserId = user.id;
    currentPreference = data?.profile_layout === 'compact-pro' ? 'compact-pro' : String(data?.profile_layout || 'standard');
    applyLayout(currentPreference);
    enhanceControls();
  } catch (error) {
    console.warn('Kompakt-Pro-Layout konnte nicht geladen werden:', error?.message || error);
  } finally {
    applying = false;
  }
}

function schedule(force = false, retries = 6) {
  clearTimeout(retryTimer);
  const run = (left) => {
    const appReady = applyLayout(currentPreference);
    enhanceControls();
    if ((!appReady || (document.querySelector('.profile-form') && !document.querySelector('select[name="profile_layout"]'))) && left > 0) {
      retryTimer = setTimeout(() => run(left - 1), 180);
    }
  };
  requestAnimationFrame(() => run(retries));
  void loadPreference(force);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(true), { once: true });
else schedule(true);
window.addEventListener('ec:navigate', () => setTimeout(() => schedule(false), 0));
window.addEventListener('focus', () => schedule(false, 2));
supabase?.auth?.onAuthStateChange?.((event) => {
  if (event === 'SIGNED_OUT') {
    currentUserId = null;
    currentPreference = 'standard';
    applyLayout('standard');
    return;
  }
  setTimeout(() => schedule(true), 80);
});
