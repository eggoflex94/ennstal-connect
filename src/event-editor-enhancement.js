import { supabase } from './supabaseClient';

let activeDialog = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function uploadEventImage(file, userId) {
  if (!file?.name || !file.size) return null;
  if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Das Bild darf höchstens 5 MB groß sein.');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/events/${crypto.randomUUID()}.${ext}`;
  let bucket = 'community-media';
  let { error } = await supabase.storage.from(bucket).upload(path, file, { upsert:false, contentType:file.type });
  if (error && /bucket not found/i.test(error.message || '')) {
    bucket = 'profile-avatars';
    ({ error } = await supabase.storage.from(bucket).upload(path, file, { upsert:false, contentType:file.type }));
  }
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
}

function closeDialog() {
  activeDialog?.remove();
  activeDialog = null;
}

async function openEventEditor(eventId) {
  const [{ data: event, error }, { data: { user } }] = await Promise.all([
    supabase.from('community_events').select('*').eq('id', eventId).maybeSingle(),
    supabase.auth.getUser()
  ]);
  if (error || !event || !user) return alert(error?.message || 'Event nicht gefunden.');

  closeDialog();
  const overlay = document.createElement('div');
  overlay.className = 'ec-event-editor-overlay';
  overlay.innerHTML = `<form class="ec-event-editor-dialog">
    <header><div><span>EVENT BEARBEITEN</span><h2>${esc(event.title)}</h2><p>Inhalt, Bild und Darstellung an einem Ort ändern.</p></div><button type="button" data-close aria-label="Schließen">×</button></header>
    <label>Titel<input name="title" value="${esc(event.title)}" required></label>
    <label>Beschreibung<textarea name="description" rows="7">${esc(event.description || '')}</textarea></label>
    <div class="ec-event-editor-grid"><label>Datum & Uhrzeit<input name="event_at" type="datetime-local" value="${new Date(event.event_at).toISOString().slice(0,16)}" required></label><label>Ort<input name="location" value="${esc(event.location || '')}"></label></div>
    ${event.image_url ? `<div class="ec-event-current-image"><img src="${esc(event.image_url)}" alt=""><small>Aktuelles Eventbild</small></div>` : ''}
    <label>Neues Bild hochladen<input name="image" type="file" accept="image/*"></label>
    <label>Bild-URL<input name="image_url" value="${esc(event.image_url || '')}" placeholder="optional"></label>
    <div class="ec-event-editor-grid">
      <label>Schriftart<select name="font_family"><option value="modern">Modern</option><option value="serif">Klassisch</option><option value="handwritten">Handschriftlich</option></select></label>
      <label>Schriftgröße<select name="font_size"><option value="small">Klein</option><option value="normal">Normal</option><option value="large">Groß</option></select></label>
      <label>Schriftfarbe<input name="font_color" type="color" value="${esc(event.font_color || '#17324a')}"></label>
      <label>Betonung<select name="emphasis"><option value="normal">Normal</option><option value="bold">Fett</option><option value="italic">Kursiv</option></select></label>
    </div>
    <footer><button type="button" data-close>Abbrechen</button><button class="primary-button">Änderungen speichern</button></footer>
  </form>`;
  document.body.appendChild(overlay);
  activeDialog = overlay;
  const form = overlay.querySelector('form');
  form.elements.font_family.value = event.font_family || 'modern';
  form.elements.font_size.value = event.font_size || 'normal';
  form.elements.emphasis.value = event.emphasis || 'normal';
  overlay.querySelectorAll('[data-close]').forEach((button) => button.onclick = closeDialog);
  overlay.onclick = (click) => { if (click.target === overlay) closeDialog(); };
  form.onsubmit = async (submit) => {
    submit.preventDefault();
    const data = new FormData(form);
    let imageUrl = String(data.get('image_url') || '').trim() || null;
    try { imageUrl = (await uploadEventImage(data.get('image'), user.id)) || imageUrl; } catch (uploadError) { return alert(uploadError.message); }
    const when = new Date(String(data.get('event_at') || ''));
    if (Number.isNaN(when.getTime())) return alert('Bitte ein gültiges Datum angeben.');
    const payload = {
      title:String(data.get('title') || '').trim(),
      description:String(data.get('description') || '').trim(),
      event_at:when.toISOString(),
      location:String(data.get('location') || '').trim() || null,
      image_url:imageUrl
    };
    const { error: updateError } = await supabase.from('community_events').update(payload).eq('id', event.id);
    if (updateError) return alert(updateError.message);
    const { error: styleError } = await supabase.rpc('ec_admin_update_event_style', {
      p_event_id:event.id,
      p_font_family:String(data.get('font_family') || 'modern'),
      p_font_size:String(data.get('font_size') || 'normal'),
      p_font_color:String(data.get('font_color') || '#17324a'),
      p_emphasis:String(data.get('emphasis') || 'normal')
    });
    if (styleError) return alert(styleError.message);
    closeDialog();
    window.dispatchEvent(new CustomEvent('ec:region-change', { detail:{ id:event.region_id } }));
  };
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('.ec-home-event [data-action="edit"]');
  if (!button) return;
  const card = button.closest('.ec-home-event');
  const eventId = card?.dataset.eventId;
  if (!eventId) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openEventEditor(eventId);
}, true);
