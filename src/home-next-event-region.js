import { supabase } from './supabaseClient';

let token = 0;
let timer = null;

const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const activeSlug = () => document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || '';
const isHome = () => Boolean(document.querySelector('.home-page'));

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function findNextEventBar() {
  const candidates = [...document.querySelectorAll('.home-page *')].filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    const text = normalize(node.textContent).toLowerCase();
    return text.includes('nächster termin') || text.includes('naechster termin');
  });
  if (!candidates.length) return null;
  const label = candidates.sort((a, b) => a.children.length - b.children.length)[0];
  return label.closest('button,article,section,div') || label.parentElement;
}

function renderBar(bar, event, regionName) {
  if (!bar) return;
  bar.classList.add('ec-region-next-event');
  bar.hidden = false;
  bar.setAttribute('data-region-event', '1');
  bar.innerHTML = '';

  const label = document.createElement('span');
  label.className = 'ec-region-next-event-label';
  label.textContent = 'NÄCHSTER TERMIN';

  const title = document.createElement('strong');
  title.className = 'ec-region-next-event-title';
  title.textContent = event?.title || `Derzeit kein kommender Termin in ${regionName || 'dieser Region'}`;

  const date = document.createElement('time');
  date.className = 'ec-region-next-event-date';
  date.textContent = event?.event_at ? formatDate(event.event_at) : '';
  if (event?.event_at) date.dateTime = event.event_at;

  bar.append(label, title, date);
  if (event?.id) {
    bar.style.cursor = 'pointer';
    bar.onclick = () => window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'events' } }));
  } else {
    bar.style.cursor = 'default';
    bar.onclick = null;
  }
}

async function loadRegionEvent() {
  const run = ++token;
  if (!supabase || !isHome()) return;
  try {
    const slug = activeSlug();
    const { data: region, error: regionError } = await supabase
      .from('regions')
      .select('id,name,slug')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (regionError) throw regionError;
    if (!region || run !== token) return;

    const now = new Date().toISOString();
    const { data: events, error } = await supabase
      .from('community_events')
      .select('id,title,event_at,region_id,status')
      .eq('region_id', region.id)
      .eq('status', 'ACTIVE')
      .gte('event_at', now)
      .order('event_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    if (run !== token) return;

    const bar = findNextEventBar();
    if (!bar) return;
    renderBar(bar, events?.[0] || null, region.name);
  } catch (error) {
    console.warn('Regionsabhängiger nächster Termin konnte nicht geladen werden:', error);
  }
}

function schedule(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void loadRegionEvent(), delay);
}

new MutationObserver(() => {
  if (isHome()) schedule(120);
}).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('ec:region-change', () => schedule(20));
window.addEventListener('focus', () => schedule(50));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(150), { once: true });
else schedule(150);
