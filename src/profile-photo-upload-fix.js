import { supabase } from './supabaseClient';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
]);
let busy = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const withTimeout = (promise, ms, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), ms);
  Promise.resolve(promise).then(
    (value) => { clearTimeout(timer); resolve(value); },
    (error) => { clearTimeout(timer); reject(error); }
  );
});
const isNetworkError = (error) => /failed to fetch|networkerror|network request failed|load failed|timeout|zeitüberschreitung/i.test(String(error?.message || error || ''));

function toast(text, ok = false) {
  document.querySelector('.ec-photo-upload-toast')?.remove();
  const node = document.createElement('div');
  node.className = `ec-photo-upload-toast${ok ? ' is-success' : ' is-error'}`;
  node.setAttribute('role', 'status');
  node.setAttribute('aria-live', 'polite');
  node.textContent = text;
  Object.assign(node.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: '99999', maxWidth: '420px',
    padding: '12px 14px', borderRadius: '12px', background: ok ? '#10271b' : '#2b1515',
    color: '#fff', border: '1px solid rgba(255,255,255,.18)', boxShadow: '0 12px 34px rgba(0,0,0,.28)'
  });
  document.body.appendChild(node);
  clearTimeout(window.__ecPhotoUploadToast);
  window.__ecPhotoUploadToast = setTimeout(() => node.remove(), ok ? 3200 : 8000);
}

function isGalleryInput(input) {
  return input instanceof HTMLInputElement && input.type === 'file' && Boolean(input.closest('.photo-upload-button'));
}

function galleryContext(input) {
  const gallery = input.closest('.profile-gallery');
  if (!gallery) return { caption: '', visibility: 'PUBLIC' };
  const caption = String(gallery.querySelector('input[maxlength="240"]')?.value || '').trim();
  const visibility = gallery.querySelector('.photo-visibility select')?.value === 'FRIENDS' ? 'FRIENDS' : 'PUBLIC';
  return { caption, visibility };
}

async function getUser() {
  const result = await withTimeout(supabase.auth.getUser(), 8000, 'Zeitüberschreitung beim Prüfen der Anmeldung.');
  if (result.error) throw result.error;
  if (!result.data?.user?.id) throw new Error('Keine aktive Anmeldung gefunden.');
  return result.data.user;
}

async function uploadObject(path, file, mime) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await withTimeout(
        supabase.storage.from('profile-avatars').upload(path, file, { upsert: false, contentType: mime, cacheControl: '3600' }),
        18000,
        'Zeitüberschreitung beim Foto-Upload.'
      );
      if (!result.error) return;
      lastError = result.error;
      if (!isNetworkError(lastError)) throw lastError;
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error)) throw error;
    }
    if (attempt < 3) {
      toast(`Verbindung zum Bildspeicher wird erneut aufgebaut … Versuch ${attempt + 1}/3`, true);
      await sleep(700 * attempt);
    }
  }
  throw lastError || new Error('Bildspeicher nicht erreichbar.');
}

async function publishPhoto(file, input) {
  if (busy) return;
  if (!supabase) return toast('Foto konnte nicht hochgeladen werden: Bildspeicher ist derzeit nicht verfügbar.');
  const mime = String(file?.type || '').toLowerCase();
  if (!file || !ALLOWED.has(mime)) return toast('Bitte PNG, JPG/JPEG, WebP oder GIF auswählen.');
  if (file.size > MAX_BYTES) return toast('Das Foto ist zu groß. Maximal 5 MB.');

  busy = true;
  input.disabled = true;
  let path = '';
  try {
    const user = await getUser();
    const { caption, visibility } = galleryContext(input);
    path = `${user.id}/gallery/${crypto.randomUUID()}.${ALLOWED.get(mime)}`;
    toast('Foto wird hochgeladen …', true);
    await uploadObject(path, file, mime);
    const { data: urlData } = supabase.storage.from('profile-avatars').getPublicUrl(path);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('Öffentliche Bildadresse konnte nicht erzeugt werden.');

    const result = await withTimeout(
      supabase.from('member_photos').insert({ owner_id: user.id, image_url: publicUrl, caption, visibility }).select('id').single(),
      12000,
      'Zeitüberschreitung beim Veröffentlichen des Fotos.'
    );
    if (result.error) throw result.error;
    path = '';
    toast('Foto wurde veröffentlicht.', true);
    setTimeout(() => window.location.reload(), 550);
  } catch (error) {
    if (path) {
      try { await supabase.storage.from('profile-avatars').remove([path]); } catch {}
    }
    console.error('Foto-Upload fehlgeschlagen:', error);
    const raw = String(error?.message || error || '').trim();
    if (/row-level security|policy|permission|unauthorized|not authorized/i.test(raw)) toast('Foto konnte nicht veröffentlicht werden: Keine Speicherberechtigung. Bitte einmal ab- und wieder anmelden.');
    else toast(`Foto konnte nicht veröffentlicht werden${raw ? `: ${raw}` : '.'}`);
  } finally {
    busy = false;
    input.disabled = false;
    input.value = '';
  }
}

function onChange(event) {
  const input = event.target;
  if (!isGalleryInput(input)) return;
  const file = input.files?.[0];
  if (!file) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void publishPhoto(file, input);
}

document.addEventListener('change', onChange, true);
