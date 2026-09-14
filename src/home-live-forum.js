import { supabase } from './supabaseClient';

async function refreshForum(event) {
  const region = event?.detail;
  if (!region?.id) return;
  const result = await supabase.from('forum_posts').select('*').eq('region_id', region.id).order('created_at', { ascending: false }).limit(5);
  const item = (result.data || []).find((post) => post.scope === 'COMMUNITY');
  const card = document.querySelector('#ec-home-activation [data-ec-activation="forum"]');
  if (!card || !item) return;
  card.querySelector('strong').textContent = item.title || 'Aktuelle Diskussion';
  card.querySelector('small').textContent = String(item.content || '').slice(0, 115);
  card.querySelector('em').textContent = 'Jetzt mitreden →';
}

window.addEventListener('ec:region-change', refreshForum);
