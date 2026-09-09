import { preparePrivilegedAction, supabase } from './supabaseClient';

let activeRegionHint = null;
let regions = [];
let viewer = null;
let requestVersion = 0;
let scheduled = null;

const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function currentSlug() {
  return activeRegionHint?.slug || document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || '';
}

async function ensureContext() {
  if (!supabase) return null;
  if (!regions.length) {
    const { data, error } = await supabase.from('regions').select('id,slug,name,short_name').eq('is_active', true).order('sort_order');
    if (error) throw error;
    regions = data || [];
  }
  if (!viewer) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    if (userId) {
      const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', userId).maybeSingle();
      viewer = profile || { id: userId, role: 'MEMBER' };
    } else viewer = { id: null, role: 'MEMBER' };
  }
  const slug = currentSlug();
  return regions.find((region) => region.slug === slug) || regions.find((region) => region.id === activeRegionHint?.id) || null;
}

function eventPanel() {
  return [...document.querySelectorAll('.community-hub .community-hub-grid > article.panel')]
    .find((panel) => norm(panel.querySelector('h2')?.textContent) === 'nächste veranstaltungen') || null;
}

function overviewPanel() {
  return [...document.querySelectorAll('.home-page section,.home-page article,.home-page .panel')]
    .find((panel) => norm(panel.querySelector('h2')?.textContent) === 'auf einen blick') || null;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function eventState(event) {
  if (String(event.status || '').toUpperCase() === 'CANCELLED') return { key: 'cancelled', label: 'Abgesagt' };
  if (new Date(event.event_at).getTime() < Date.now()) return { key: 'past', label: 'Vergangen' };
  return { key: 'active', label: 'Aktuell' };
}

async function setRsvp(eventId, status) {
  if (!viewer?.id) return;
  const { error } = await supabase.from('community_event_rsvps').upsert({ event_id: eventId, user_id: viewer.id, status }, { onConflict: 'event_id,user_id' });
  if (error) {
    console.warn('Event-Zusage konnte nicht gespeichert werden:', error);
    return;
  }
  schedule(0);
}

async function editEvent(event) {
  if (!['HEAD_ADMIN', 'ADMIN'].includes(String(viewer?.role || '').toUpperCase())) return;
  const title = prompt('Titel:', event.title || '');
  if (title === null) return;
  const when = prompt('Datum und Uhrzeit:', new Date(event.event_at).toISOString().slice(0, 16));
  if (when === null) return;
  const location = prompt('Ort:', event.location || '');
  if (location === null) return;
  const description = prompt('Beschreibung:', event.description || '');
  if (description === null) return;
  const parsed = new Date(when);
  if (title.trim().length < 3 || Number.isNaN(parsed.getTime())) return;
  const prepared = await preparePrivilegedAction('Veranstaltung bearbeiten', event.id);
  if (prepared?.error) return;
  const { error } = await supabase.from('community_events').update({ title: title.trim(), event_at: parsed.toISOString(), location: location.trim() || null, description: description.trim() }).eq('id', event.id);
  if (!error) window.dispatchEvent(new CustomEvent('ec:regional-events-refresh'));
}

async function toggleEvent(event) {
  if (!['HEAD_ADMIN', 'ADMIN'].includes(String(viewer?.role || '').toUpperCase())) return;
  const cancelled = String(event.status || '').toUpperCase() === 'CANCELLED';
  const reason = cancelled ? null : prompt('Grund der Absage:', '');
  if (!cancelled && (reason === null || reason.trim().length < 5)) return;
  const prepared = await preparePrivilegedAction(cancelled ? 'Veranstaltung wieder aktivieren' : 'Veranstaltung absagen', event.id, reason || '');
  if (prepared?.error) return;
  const patch = cancelled
    ? { status: 'ACTIVE', cancellation_reason: null, cancelled_at: null }
    : { status: 'CANCELLED', cancellation_reason: reason.trim(), cancelled_at: new Date().toISOString() };
  const { error } = await supabase.from('community_events').update(patch).eq('id', event.id);
  if (!error) window.dispatchEvent(new CustomEvent('ec:regional-events-refresh'));
}

async function deleteEvent(event) {
  if (!['HEAD_ADMIN', 'ADMIN'].includes(String(viewer?.role || '').toUpperCase())) return;
  if (!confirm(`Veranstaltung „${event.title}“ wirklich löschen?`)) return;
  const prepared = await preparePrivilegedAction('Veranstaltung löschen', event.id);
  if (prepared?.error) return;
  const { error } = await supabase.from('community_events').delete().eq('id', event.id);
  if (!error) window.dispatchEvent(new CustomEvent('ec:regional-events-refresh'));
}

function buildEventRow(event, rsvpStatus) {
  const state = eventState(event);
  const article = document.createElement('article');
  article.className = `ec-regional-event-row is-${state.key}${event.image_url ? ' has-image' : ''}`;
  article.dataset.eventId = event.id;

  if (event.image_url) {
    const image = document.createElement('img');
    image.src = event.image_url;
    image.alt = '';
    image.loading = 'lazy';
    article.appendChild(image);
  }

  const body = document.createElement('div');
  body.className = 'ec-regional-event-body';
  body.innerHTML = `<div class="ec-regional-event-top"><span class="ec-regional-event-state">${esc(state.label)}</span><time>${esc(formatDate(event.event_at))}</time></div><strong>${esc(event.title)}</strong>${event.location ? `<span class="ec-regional-event-location">⌖ ${esc(event.location)}</span>` : ''}${event.description ? `<p>${esc(event.description)}</p>` : ''}${state.key === 'cancelled' && event.cancellation_reason ? `<small class="ec-regional-event-cancel-reason">${esc(event.cancellation_reason)}</small>` : ''}`;
  article.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'ec-regional-event-actions';
  if (state.key === 'active' && viewer?.id) {
    for (const [status, label] of [['INTERESTED', '☆ Interessiert'], ['GOING', '✓ Ich komme']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = rsvpStatus === status ? 'primary-button' : 'secondary-button';
      button.textContent = label;
      button.onclick = () => void setRsvp(event.id, status);
      actions.appendChild(button);
    }
  }
  if (['HEAD_ADMIN', 'ADMIN'].includes(String(viewer?.role || '').toUpperCase())) {
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-button'; edit.textContent = 'Bearbeiten'; edit.onclick = () => void editEvent(event); actions.appendChild(edit);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'secondary-button'; toggle.textContent = state.key === 'cancelled' ? 'Aktivieren' : 'Absagen'; toggle.onclick = () => void toggleEvent(event); actions.appendChild(toggle);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'ec-event-delete-button'; del.textContent = 'Löschen'; del.onclick = () => void deleteEvent(event); actions.appendChild(del);
  }
  if (actions.children.length) article.appendChild(actions);
  return article;
}

function renderCommunity(region, events, rsvps) {
  const panel = eventPanel();
  if (!panel) return;
  panel.classList.add('ec-regional-events-panel');
  panel.querySelector('.ec-regional-events-authority')?.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'ec-regional-events-authority';
  wrapper.dataset.regionId = region.id;
  const header = document.createElement('div');
  header.className = 'ec-regional-events-context';
  header.innerHTML = `<span>REGION</span><strong>${esc(region.name)}</strong><small>${events.length} eingetragene Veranstaltung${events.length === 1 ? '' : 'en'}</small>`;
  wrapper.appendChild(header);

  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'ec-regional-events-empty';
    empty.textContent = `In ${region.name} sind derzeit keine Veranstaltungen eingetragen.`;
    wrapper.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'ec-regional-events-list';
    const sorted = [...events].sort((a, b) => {
      const aPast = new Date(a.event_at).getTime() < Date.now();
      const bPast = new Date(b.event_at).getTime() < Date.now();
      if (aPast !== bPast) return aPast ? 1 : -1;
      return aPast ? new Date(b.event_at) - new Date(a.event_at) : new Date(a.event_at) - new Date(b.event_at);
    });
    sorted.forEach((event) => list.appendChild(buildEventRow(event, rsvps.get(event.id))));
    wrapper.appendChild(list);
  }
  panel.appendChild(wrapper);
}

function renderHome(region, events) {
  const panel = overviewPanel();
  if (!panel) return;
  const next = events
    .filter((event) => String(event.status || '').toUpperCase() !== 'CANCELLED' && new Date(event.event_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.event_at) - new Date(b.event_at))[0] || null;
  let bar = panel.querySelector('[data-regional-event-authority-home]');
  if (!bar) {
    bar = document.createElement('button');
    bar.type = 'button';
    bar.dataset.regionalEventAuthorityHome = '1';
    bar.className = 'ec-region-next-event-final ec-region-next-event-authority';
    panel.appendChild(bar);
  }
  bar.innerHTML = `<span>NÄCHSTER TERMIN · ${esc(region.name)}</span><strong>${esc(next?.title || `Derzeit kein kommender Termin in ${region.name}`)}</strong><time>${next ? esc(formatDate(next.event_at)) : ''}</time>`;
  bar.disabled = !next;
  bar.onclick = next ? () => window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'events' } })) : null;
  panel.querySelectorAll('button').forEach((button) => {
    if (button === bar) return;
    const text = norm(button.textContent);
    if (text.includes('nächster termin') || text.includes('naechster termin')) button.classList.add('ec-native-next-event-hidden');
  });
}

async function refresh() {
  const version = ++requestVersion;
  if (!supabase || (!eventPanel() && !overviewPanel())) return;
  try {
    const region = await ensureContext();
    if (!region || version !== requestVersion) return;
    document.documentElement.dataset.ecRegion = region.slug;
    const { data: events, error } = await supabase.from('community_events')
      .select('id,title,description,event_at,location,image_url,status,cancellation_reason,cancelled_at,region_id,created_by')
      .eq('region_id', region.id)
      .order('event_at', { ascending: true });
    if (error) throw error;
    if (version !== requestVersion) return;
    let rsvps = new Map();
    if (viewer?.id && events?.length) {
      const ids = events.map((event) => event.id);
      const { data } = await supabase.from('community_event_rsvps').select('event_id,status').eq('user_id', viewer.id).in('event_id', ids);
      rsvps = new Map((data || []).map((row) => [row.event_id, row.status]));
    }
    if (version !== requestVersion) return;
    renderCommunity(region, events || [], rsvps);
    renderHome(region, events || []);
    try {
      sessionStorage.setItem(`ec-region-events:${region.id}`, JSON.stringify({ savedAt: Date.now(), events: events || [] }));
    } catch {}
  } catch (error) {
    console.warn('Regionale Veranstaltungen konnten nicht synchronisiert werden:', error);
  }
}

function renderCached(region) {
  if (!region?.id) return;
  try {
    const cached = JSON.parse(sessionStorage.getItem(`ec-region-events:${region.id}`) || 'null');
    if (!cached?.events || Date.now() - Number(cached.savedAt || 0) > 10 * 60 * 1000) return;
    renderCommunity(region, cached.events, new Map());
    renderHome(region, cached.events);
  } catch {}
}

function schedule(delay = 40) {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => void refresh(), delay);
}

function scheduleAfterNavigation() {
  schedule(40);
  setTimeout(() => schedule(0), 180);
}

window.addEventListener('ec:region-change', (event) => {
  activeRegionHint = event.detail || null;
  if (activeRegionHint?.slug) {
    document.documentElement.dataset.ecRegion = activeRegionHint.slug;
    renderCached(activeRegionHint);
  }
  scheduleAfterNavigation();
});
window.addEventListener('ec:navigate', scheduleAfterNavigation);
window.addEventListener('ec:regional-events-refresh', () => schedule(0));
window.addEventListener('focus', () => schedule(80));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleAfterNavigation, { once: true });
else scheduleAfterNavigation();
