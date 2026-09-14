import { supabase } from './supabaseClient';

let activeRegion = null;
let requestVersion = 0;
let refreshTimer = null;
let lastLoadedRegionId = null;
let lastLoadedAt = 0;
const FRESH_FOR_MS = 20_000;

function scheduleRefresh(delay = 150, force = false) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void refreshForum(force), delay);
}

async function refreshForum(force = false) {
  const region = activeRegion;
  if (!supabase || !region?.id || !document.querySelector('.home-page')) return;
  if (!force && lastLoadedRegionId === region.id && Date.now() - lastLoadedAt < FRESH_FOR_MS) return;
  const version = ++requestVersion;
  const result = await supabase
    .from('forum_posts')
    .select('id,title,content,created_at,region_id,scope')
    .eq('region_id', region.id)
    .eq('scope', 'COMMUNITY')
    .order('created_at', { ascending: false })
    .limit(1);
  if (result.error || version !== requestVersion || activeRegion?.id !== region.id) return;
  lastLoadedRegionId = region.id;
  lastLoadedAt = Date.now();
  const item = result.data?.[0];
  const card = document.querySelector('#ec-home-activation [data-ec-activation="forum"]');
  if (!card) return;
  if (item) {
    card.querySelector('strong').textContent = item.title || 'Aktuelle Diskussion';
    card.querySelector('small').textContent = String(item.content || '').slice(0, 115);
    card.querySelector('em').textContent = 'Jetzt mitreden →';
  } else {
    card.querySelector('strong').textContent = 'Noch keine aktuelle Diskussion';
    card.querySelector('small').textContent = `In ${region.name} wartet das Forum auf den nächsten Beitrag.`;
    card.querySelector('em').textContent = 'Diskussion starten →';
  }
}

window.addEventListener('ec:region-change', (event) => {
  activeRegion = event.detail || null;
  requestVersion += 1;
  scheduleRefresh(150, true);
});
window.addEventListener('ec:navigate', () => scheduleRefresh(220));
