import { preparePrivilegedAction, supabase } from './supabaseClient';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);
let submitting = false;
let ensuringRegionSelect = false;
let regionCache = [];

function toast(text, ok = false) {
  document.querySelector('.ec-event-runtime-toast')?.remove();
  const node = document.createElement('div');
  node.className = `ec-event-runtime-toast${ok ? ' is-success' : ' is-error'}`;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.textContent = text;
  Object.assign(node.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: '99999', maxWidth: '420px',
    padding: '12px 14px', borderRadius: '12px', background: ok ? '#10271b' : '#2b1515',
    color: '#fff', border: '1px solid rgba(255,255,255,.18)', boxShadow: '0 12px 34px rgba(0,0,0,.28)'
  });
  document.body.appendChild(node);
  clearTimeout(window.__ecEventRuntimeToast);
  window.__ecEventRuntimeToast = setTimeout(() => node.remove(), ok ? 3500 : 8000);
}

function eventForm() {
  return [...document.querySelectorAll('.admin-community-tools form')].find((form) =>
    /veranstaltung erstellen/i.test(String(form.querySelector('h3')?.textContent || ''))
  ) || null;
}

async function loadManageableRegions() {
  if (!supabase) return [];
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) return [];
  const userId = authData.user.id;
  const [{ data: profile }, { data: regions }, { data: assignments }] = await Promise.all([
    supabase.from('profiles').select('role,home_region_id').eq('id', userId).maybeSingle(),
    supabase.from('regions').select('id,slug,name,short_name,is_active,sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('regional_admin_assignments').select('region_id,active').eq('user_id', userId).eq('active', true)
  ]);
  const available = regions || [];
  if (profile?.role === 'HEAD_ADMIN' || profile?.role === 'ADMIN') return available;
  const allowed = new Set((assignments || []).filter((row) => row.active).map((row) => row.region_id));
  return available.filter((region) => allowed.has(region.id));
}

function preferredRegion(regions) {
  const saved = localStorage.getItem('ec-active-region');
  return regions.find((region) => region.slug === saved) || regions[0] || null;
}

async function ensureRegionSelect() {
  const form = eventForm();
  if (!form || form.querySelector('[data-ec-event-region]') || ensuringRegionSelect || form.dataset.ecEventRegionPending === '1') return;
  ensuringRegionSelect = true;
  form.dataset.ecEventRegionPending = '1';
  try {
    const manageable = await loadManageableRegions();
    if (!form.isConnected || form !== eventForm() || form.querySelector('[data-ec-event-region]')) return;
    regionCache = manageable;
    if (!regionCache.length) return;

    const label = document.createElement('label');
    label.className = 'content-image-upload ec-event-region-field';
    label.dataset.ecEventRegion = '1';
    label.append('Region für diese Veranstaltung');
    const select = document.createElement('select');
    select.name = 'ec_event_region';
    select.required = true;
    select.setAttribute('aria-label', 'Region für diese Veranstaltung');
    regionCache.forEach((region) => {
      const option = document.createElement('option');
      option.value = region.id;
      option.textContent = region.name || region.short_name || region.slug;
      select.appendChild(option);
    });
    const preferred = preferredRegion(regionCache);
    if (preferred) select.value = preferred.id;
    label.appendChild(select);

    const title = form.querySelector('input[name="title"]');
    form.insertBefore(label, title || form.firstChild);

    if (!form.querySelector('input[name="image"]')) {
      const imageLabel = document.createElement('label');
      imageLabel.className = 'content-image-upload';
      imageLabel.append('Veranstaltungsbild hochladen (optional)');
      const imageInput = document.createElement('input');
      imageInput.name = 'image';
      imageInput.type = 'file';
      imageInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
      imageLabel.appendChild(imageInput);
      const imageUrl = form.querySelector('input[name="image_url"]');
      imageUrl?.insertAdjacentElement('afterend', imageLabel);
    }
  } finally {
    delete form.dataset.ecEventRegionPending;
    ensuringRegionSelect = false;
  }
}

async function uploadImage(file, userId) {
  if (!file || !file.name || file.size === 0) return { publicUrl: null, path: null };
  const mime = String(file.type || '').toLowerCase();
  if (!ALLOWED.has(mime)) throw new Error('Erlaubt sind PNG, JPG/JPEG, WebP und GIF.');
  if (file.size > MAX_BYTES) throw new Error('Das Veranstaltungsbild darf höchstens 5 MB groß sein.');
  const path = `${userId}/events/${crypto.randomUUID()}.${ALLOWED.get(mime)}`;
  const { error } = await supabase.storage.from('profile-avatars').upload(path, file, {
    upsert: false, contentType: mime, cacheControl: '3600'
  });
  if (error) throw error;
  const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path);
  if (!data?.publicUrl) {
    await supabase.storage.from('profile-avatars').remove([path]);
    throw new Error('Für das Veranstaltungsbild konnte keine öffentliche URL erstellt werden.');
  }
  return { publicUrl: data.publicUrl, path };
}

async function createRegionalEvent(form) {
  if (submitting) return;
  submitting = true;
  const submitButton = form.querySelector('button[type="submit"], button.primary-button');
  if (submitButton) submitButton.disabled = true;
  let uploadedPath = null;
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) throw authError || new Error('Keine aktive Anmeldung gefunden.');
    const user = authData.user;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const description = String(data.get('description') || '').trim();
    const location = String(data.get('location') || '').trim();
    const eventAtRaw = String(data.get('event_at') || '').trim();
    const regionId = String(data.get('ec_event_region') || '').trim();
    if (title.length < 3) throw new Error('Bitte einen Veranstaltungstitel mit mindestens 3 Zeichen eingeben.');
    if (!regionId || !regionCache.some((region) => region.id === regionId)) throw new Error('Bitte eine gültige Region auswählen.');
    const eventDate = new Date(eventAtRaw);
    if (!eventAtRaw || Number.isNaN(eventDate.getTime())) throw new Error('Bitte Datum und Uhrzeit der Veranstaltung angeben.');

    const prepared = await preparePrivilegedAction('Veranstaltung veröffentlichen');
    if (prepared?.error) throw prepared.error;

    const upload = await uploadImage(data.get('image'), user.id);
    uploadedPath = upload.path;
    const imageUrl = upload.publicUrl || String(data.get('image_url') || '').trim() || null;
    const { data: created, error } = await supabase.from('community_events').insert({
      title,
      description,
      event_at: eventDate.toISOString(),
      location: location || null,
      image_url: imageUrl,
      created_by: user.id,
      region_id: regionId
    }).select('id,region_id').single();
    if (error) throw error;
    uploadedPath = null;

    const selectedRegion = regionCache.find((region) => region.id === created?.region_id) || regionCache.find((region) => region.id === regionId);
    if (selectedRegion) {
      localStorage.setItem('ec-active-region', selectedRegion.slug);
      window.dispatchEvent(new CustomEvent('ec:region-change', { detail: selectedRegion }));
    }
    form.reset();
    if (selectedRegion) form.querySelector('[name="ec_event_region"]')?.setAttribute('value', selectedRegion.id);
    toast(`Veranstaltung wurde für ${selectedRegion?.name || 'die gewählte Region'} veröffentlicht.`, true);
    setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    if (uploadedPath) {
      try { await supabase.storage.from('profile-avatars').remove([uploadedPath]); } catch {}
    }
    console.error('Regionaler Veranstaltungs-Upload fehlgeschlagen:', error);
    toast(`Veranstaltung konnte nicht veröffentlicht werden: ${error?.message || error}`);
  } finally {
    submitting = false;
    if (submitButton) submitButton.disabled = false;
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form !== eventForm() || !form.querySelector('[data-ec-event-region]')) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void createRegionalEvent(form);
}

document.addEventListener('submit', onSubmit, true);
let observerQueued = false;
const observer = new MutationObserver(() => {
  if (observerQueued) return;
  observerQueued = true;
  requestAnimationFrame(() => {
    observerQueued = false;
    void ensureRegionSelect();
  });
});
observer.observe(document.documentElement, { childList: true, subtree: true });
void ensureRegionSelect();
