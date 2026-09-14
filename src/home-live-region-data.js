import { supabase } from './supabaseClient';

let activeRegion = null;
let refreshTimer = null;

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refreshLiveCards, 150);
}

function setCard(kind, title, detail, footer) {
  const card = document.querySelector(`#ec-home-activation [data-ec-activation="${kind}"]`);
  if (!card) return;
  const heading = card.querySelector('strong');
  const copy = card.querySelector('small');
  const meta = card.querySelector('em');
  if (heading) heading.textContent = title;
  if (copy) copy.textContent = detail;
  if (meta) meta.textContent = footer;
}

async function refreshLiveCards() {
  if (!supabase || !activeRegion?.id) return;
  const now = new Date().toISOString();
  const { data } = await supabase.from('community_events').select('*').eq('region_id', activeRegion.id).gte('event_at', now).order('event_at', { ascending: true }).limit(1);
  const event = data?.[0];
  if (event) {
    const day = new Date(event.event_at).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
    setCard('events', event.title || event.name || 'Nächstes Event', (event.description || event.location || 'Gemeinsam etwas erleben.').slice(0, 115), `${day} · Event ansehen →`);
  } else {
    setCard('events', 'Noch kein kommendes Event', `In ${activeRegion.name} ist aktuell kein Event eingetragen.`, 'Events öffnen →');
  }
}

window.addEventListener('ec:region-change', (event) => {
  activeRegion = event.detail || null;
  scheduleRefresh();
});
window.addEventListener('ec:navigate', scheduleRefresh);
