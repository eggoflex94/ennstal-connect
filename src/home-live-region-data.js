import { supabase } from './supabaseClient';

let activeRegion = null;
let refreshTimer = null;

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshLiveCards, 150);
}

async function refreshLiveCards() {
  if (!supabase || !activeRegion?.id) return;
}

window.addEventListener('ec:region-change', (event) => {
  activeRegion = event.detail || null;
  scheduleRefresh();
});
window.addEventListener('ec:navigate', scheduleRefresh);
