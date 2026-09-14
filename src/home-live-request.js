import { supabase } from './supabaseClient';

async function refreshRequest(event) {
  const region = event?.detail;
  if (!region?.id) return;
  const result = await supabase.from('community_requests').select('*').eq('region_id', region.id).eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(1);
  const item = result.data?.[0];
  const card = document.querySelector('#ec-home-activation [data-ec-activation="community"]');
  if (!card) return;
  if (item) {
    card.querySelector('strong').textContent = item.title || 'Aktuelle Suche';
    card.querySelector('small').textContent = String(item.content || '').slice(0, 115);
    card.querySelector('em').textContent = 'Gesucht & gefunden · Helfen →';
  }
}

window.addEventListener('ec:region-change', refreshRequest);
