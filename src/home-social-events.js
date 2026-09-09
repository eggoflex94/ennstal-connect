import { supabase } from './supabaseClient';

let currentUser = null;
let currentProfile = null;
let activeRegionId = null;
let canManageRegion = false;
let refreshTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = (date) => date ? new Date(date).toLocaleString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

function getActiveRegionId() {
  const picker = document.querySelector('.ec-region-picker select');
  const slug = picker?.value || localStorage.getItem('ec-active-region');
  return slug;
}

async function resolveContext() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user || null;
  if (!currentUser) return;
  const [{ data: profile }, { data: regions }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('id,nickname,role,home_region_id').eq('id', currentUser.id).maybeSingle(),
    supabase.from('regions').select('id,slug,name').eq('is_active', true),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', currentUser.id).eq('active', true)
  ]);
  currentProfile = profile || null;
  const slug = getActiveRegionId();
  activeRegionId = (regions || []).find((r) => r.slug === slug)?.id || currentProfile?.home_region_id || null;
  const role = String(currentProfile?.role || '').toUpperCase();
  canManageRegion = role === 'HEAD_ADMIN' || role === 'ADMIN' || (assignments || []).some((a) => a.region_id === activeRegionId && a.active);
}

async function uploadEventImage(file) {
  if (!file?.name || !file.size) return null;
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${currentUser.id}/events/${crypto.randomUUID()}.${ext}`;
  let bucket = 'community-media';
  let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert:false, contentType:file.type });
  if (error && /bucket not found/i.test(error.message || '')) {
    bucket = 'profile-avatars';
    ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert:false, contentType:file.type }));
  }
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
}

function activityCard(row) {
  const event = row.event_title ? `<button type="button" class="ec-activity-event-link" data-event-id="${esc(row.event_id)}">▣ ${esc(row.event_title)} · ${esc(fmt(row.event_at))}</button>` : '';
  return `<article class="ec-friend-activity" data-activity-id="${esc(row.id)}">
    <img src="${esc(row.avatar_url || '/community-default-avatar.png')}" alt="">
    <div><div class="ec-friend-activity-head"><strong>${esc(row.nickname || 'Mitglied')}</strong><small>${esc(fmt(row.created_at))}</small></div><p>${esc(row.content)}</p>${event}<small class="ec-activity-visibility">${row.visibility === 'FRIENDS' ? '♥ Freunde' : row.visibility === 'REGION' ? '⌖ Region' : '🔒 Privat'}</small></div>
    ${row.is_mine ? '<button type="button" class="ec-activity-delete" aria-label="Aktivität löschen">×</button>' : ''}
  </article>`;
}

async function loadActivities() {
  const { data, error } = await supabase.rpc('ec_activity_feed', { p_region: activeRegionId });
  if (error) return [];
  return data || [];
}

async function loadEvents() {
  let query = supabase.from('community_events').select('*').gte('event_at', new Date().toISOString()).order('event_at', { ascending:true }).limit(8);
  if (activeRegionId) query = query.eq('region_id', activeRegionId);
  const { data } = await query;
  return data || [];
}

async function loadReminders() {
  const { data } = await supabase.rpc('ec_my_event_reminders');
  return data || [];
}

async function shareEvent(event) {
  const visibility = prompt('Sichtbarkeit: FRIENDS oder REGION', 'FRIENDS');
  if (!visibility) return;
  const normalized = visibility.trim().toUpperCase();
  if (!['FRIENDS','REGION'].includes(normalized)) return alert('Bitte FRIENDS oder REGION eingeben.');
  const text = prompt('Text dazu:', `Ich interessiere mich für „${event.title}“`);
  if (text === null || text.trim().length < 2) return;
  const { error } = await supabase.rpc('ec_create_activity', { p_content:text.trim(), p_visibility:normalized, p_event_id:event.id, p_expires_hours:72 });
  if (error) return alert(error.message);
  scheduleRefresh();
}

async function createEvent(form) {
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const eventAt = String(data.get('event_at') || '');
  if (title.length < 3 || !eventAt || !activeRegionId) return alert('Bitte Titel, Datum und Region vollständig angeben.');
  let imageUrl = String(data.get('image_url') || '').trim() || null;
  try { imageUrl = (await uploadEventImage(data.get('image'))) || imageUrl; } catch (error) { return alert(error.message); }
  const payload = {
    title,
    description:String(data.get('description') || '').trim(),
    event_at:new Date(eventAt).toISOString(),
    location:String(data.get('location') || '').trim() || null,
    image_url:imageUrl,
    created_by:currentUser.id,
    region_id:activeRegionId,
    font_family:String(data.get('font_family') || 'modern'),
    font_size:String(data.get('font_size') || 'normal'),
    font_color:String(data.get('font_color') || '#17324a'),
    emphasis:String(data.get('emphasis') || 'normal')
  };
  const { error } = await supabase.from('community_events').insert(payload);
  if (error) return alert(error.message);
  form.reset();
  scheduleRefresh();
}

async function editEvent(event) {
  const title = prompt('Titel:', event.title); if (title === null) return;
  const description = prompt('Beschreibung:', event.description || ''); if (description === null) return;
  const when = prompt('Datum/Uhrzeit:', new Date(event.event_at).toISOString().slice(0,16)); if (when === null) return;
  const location = prompt('Ort:', event.location || ''); if (location === null) return;
  const fontFamily = prompt('Schriftart: modern / serif / handwritten', event.font_family || 'modern'); if (fontFamily === null) return;
  const fontSize = prompt('Schriftgröße: small / normal / large', event.font_size || 'normal'); if (fontSize === null) return;
  const fontColor = prompt('Schriftfarbe (Hex):', event.font_color || '#17324a'); if (fontColor === null) return;
  const emphasis = prompt('Betonung: normal / bold / italic', event.emphasis || 'normal'); if (emphasis === null) return;
  const { error } = await supabase.from('community_events').update({ title:title.trim(), description:description.trim(), event_at:new Date(when).toISOString(), location:location.trim() || null }).eq('id', event.id);
  if (error) return alert(error.message);
  const styleResult = await supabase.rpc('ec_admin_update_event_style', { p_event_id:event.id, p_font_family:fontFamily.trim(), p_font_size:fontSize.trim(), p_font_color:fontColor.trim(), p_emphasis:emphasis.trim() });
  if (styleResult.error) return alert(styleResult.error.message);
  scheduleRefresh();
}

async function deleteEvent(event) {
  if (!confirm(`Event „${event.title}“ wirklich löschen?`)) return;
  const { error } = await supabase.from('community_events').delete().eq('id', event.id);
  if (error) return alert(error.message);
  scheduleRefresh();
}

function eventCard(event, reminder = false) {
  const fontClass = `ec-font-${esc(event.font_family || 'modern')} ec-size-${esc(event.font_size || 'normal')} ec-em-${esc(event.emphasis || 'normal')}`;
  return `<article class="ec-home-event ${event.status === 'CANCELLED' ? 'is-cancelled' : ''}" data-event-id="${esc(event.id)}">
    ${event.image_url ? `<img src="${esc(event.image_url)}" alt="">` : ''}
    <div class="ec-home-event-body ${fontClass}" style="--event-color:${esc(event.font_color || '#17324a')}">
      <small>${reminder ? 'ERINNERUNG' : 'AKTUELLES EVENT'}</small>
      <h3>${esc(event.title)}</h3>
      <p class="ec-home-event-meta">${esc(fmt(event.event_at))}${event.location ? ` · ${esc(event.location)}` : ''}</p>
      ${event.description ? `<p>${esc(event.description)}</p>` : ''}
      <div class="ec-home-event-actions">
        <button type="button" data-action="share">Aktivität teilen</button>
        <button type="button" data-action="going">Ich bin dabei</button>
        <button type="button" data-action="interested">Interessiert</button>
        ${canManageRegion ? '<button type="button" data-action="edit">Bearbeiten</button><button type="button" data-action="delete" class="danger">Löschen</button>' : ''}
      </div>
    </div>
  </article>`;
}

function buildHomeShell(home) {
  let social = home.querySelector('.ec-home-social');
  if (!social) {
    social = document.createElement('section');
    social.className = 'ec-home-social';
    social.innerHTML = `
      <div class="ec-home-social-grid">
        <article class="ec-status-card panel">
          <span class="eyebrow">AKTIVITÄTEN</span><h2>Was machst du gerade?</h2>
          <form class="ec-status-form"><textarea name="content" maxlength="500" placeholder="z. B. Bin heute in Leoben unterwegs …" required></textarea><div><select name="visibility"><option value="FRIENDS">Nur Freunde</option><option value="REGION">Meine Region</option><option value="PRIVATE">Nur ich</option></select><select name="expires"><option value="24">24 Stunden</option><option value="72">3 Tage</option><option value="168">7 Tage</option><option value="0">Ohne Ablauf</option></select><button>Aktivität teilen</button></div></form>
        </article>
        <article class="ec-reminder-card panel"><span class="eyebrow">ERINNERUNGEN</span><h2>Deine kommenden Events</h2><div class="ec-reminder-list"></div></article>
      </div>
      <section class="ec-friend-feed panel"><div class="ec-section-head"><div><span class="eyebrow">FREUNDE & REGION</span><h2>Aktuelle Aktivitäten</h2></div></div><div class="ec-friend-feed-list"></div></section>
      <section class="ec-home-events panel"><div class="ec-section-head"><div><span class="eyebrow">VERANSTALTUNGEN</span><h2>Aktuelle Events</h2><p>Events der ausgewählten Region direkt auf der Startseite.</p></div></div><div class="ec-home-event-list"></div><div class="ec-event-admin-slot"></div></section>
    `;
    const heading = home.querySelector('.page-heading');
    heading?.insertAdjacentElement('afterend', social);

    social.querySelector('.ec-status-form').onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const { error } = await supabase.rpc('ec_create_activity', { p_content:String(f.get('content') || '').trim(), p_visibility:String(f.get('visibility') || 'FRIENDS'), p_event_id:null, p_expires_hours:Number(f.get('expires') || 24) });
      if (error) return alert(error.message); e.currentTarget.reset(); scheduleRefresh();
    };
  }
  return social;
}

function buildAdminEventForm(slot) {
  slot.innerHTML = '';
  if (!canManageRegion) return;
  const details = document.createElement('details');
  details.className = 'ec-event-admin';
  details.innerHTML = `<summary>+ Neues Event erstellen</summary><form class="ec-event-create-form">
    <input name="title" placeholder="Event-Titel" required><textarea name="description" placeholder="Beschreibung"></textarea>
    <div class="ec-event-form-grid"><label>Datum & Uhrzeit<input name="event_at" type="datetime-local" required></label><label>Ort<input name="location" placeholder="Ort"></label></div>
    <input name="image_url" placeholder="Bild-URL (optional)"><label>Bild hochladen<input name="image" type="file" accept="image/*"></label>
    <div class="ec-event-form-grid"><label>Schriftart<select name="font_family"><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label><label>Schriftgröße<select name="font_size"><option value="small">Klein</option><option value="normal" selected>Normal</option><option value="large">Groß</option></select></label><label>Schriftfarbe<input name="font_color" type="color" value="#17324a"></label><label>Betonung<select name="emphasis"><option value="normal">Normal</option><option value="bold">Fett</option><option value="italic">Kursiv</option></select></label></div>
    <button class="primary-button">Event veröffentlichen</button>
  </form>`;
  details.querySelector('form').onsubmit = (e) => { e.preventDefault(); void createEvent(e.currentTarget); };
  slot.appendChild(details);
}

async function renderHome() {
  const home = document.querySelector('.home-page');
  if (!home || !currentUser) return;
  const social = buildHomeShell(home);
  const [activities, events, reminders] = await Promise.all([loadActivities(), loadEvents(), loadReminders()]);
  const feed = social.querySelector('.ec-friend-feed-list');
  feed.innerHTML = activities.length ? activities.map(activityCard).join('') : '<div class="ec-empty-state">Noch keine Aktivitäten. Teile den ersten Moment mit deinen Freunden.</div>';
  feed.querySelectorAll('.ec-activity-delete').forEach((button) => button.onclick = async () => { const id = button.closest('[data-activity-id]')?.dataset.activityId; if (!id) return; await supabase.rpc('ec_delete_activity', { p_activity_id:id }); scheduleRefresh(); });

  const reminderList = social.querySelector('.ec-reminder-list');
  reminderList.innerHTML = reminders.length ? reminders.map((r) => `<button type="button" data-event-id="${esc(r.event_id)}"><strong>${esc(r.title)}</strong><small>${esc(fmt(r.event_at))}${r.location ? ` · ${esc(r.location)}` : ''}</small></button>`).join('') : '<p>Keine anstehenden Erinnerungen.</p>';

  const list = social.querySelector('.ec-home-event-list');
  list.innerHTML = events.length ? events.map((event) => eventCard(event)).join('') : '<div class="ec-empty-state">Derzeit keine kommenden Events in dieser Region.</div>';
  list.querySelectorAll('.ec-home-event').forEach((card) => {
    const event = events.find((item) => item.id === card.dataset.eventId); if (!event) return;
    card.querySelector('[data-action="share"]')?.addEventListener('click', () => shareEvent(event));
    card.querySelector('[data-action="going"]')?.addEventListener('click', async () => { const { error } = await supabase.from('community_event_rsvps').upsert({ event_id:event.id, user_id:currentUser.id, status:'GOING' }, { onConflict:'event_id,user_id' }); if (error) alert(error.message); else scheduleRefresh(); });
    card.querySelector('[data-action="interested"]')?.addEventListener('click', async () => { const { error } = await supabase.from('community_event_rsvps').upsert({ event_id:event.id, user_id:currentUser.id, status:'INTERESTED' }, { onConflict:'event_id,user_id' }); if (error) alert(error.message); else scheduleRefresh(); });
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => editEvent(event));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteEvent(event));
  });
  buildAdminEventForm(social.querySelector('.ec-event-admin-slot'));
}

function removeEventsFromTopNav() {
  document.querySelector('.ec-top-nav [data-ec-page="events"]')?.remove();
}

async function refresh() {
  await resolveContext();
  removeEventsFromTopNav();
  await renderHome();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refresh(), 80);
}

window.addEventListener('ec:region-change', scheduleRefresh);
window.addEventListener('focus', scheduleRefresh, { passive:true });
new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList:true, subtree:true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleRefresh, { once:true }); else scheduleRefresh();
