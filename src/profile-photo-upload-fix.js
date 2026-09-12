import './profile-photo-album-modern.js';

// Keep the native React upload path authoritative. We only normalize files that
// are likely to exceed the existing 5 MB limit or use a phone-photo format that
// benefits from conversion, then re-dispatch the same change event to React.
const STANDARD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_OUTPUT_EDGE = 2400;
const NORMALIZE_OVER = 4.5 * 1024 * 1024;
let processing = false;

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded image keeps its pixels; the object URL is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function canvasBlob(canvas, type = 'image/jpeg', quality = .88) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.')), type, quality);
  });
}

async function normalize(file) {
  const source = await decodeImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('Bildformat konnte nicht gelesen werden.');
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height));
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Bildverarbeitung ist auf diesem Gerät nicht verfügbar.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(source, 0, 0, outW, outH);
  source.close?.();
  const blob = await canvasBlob(canvas, 'image/jpeg', .88);
  const base = String(file.name || 'foto').replace(/\.[^.]+$/, '').slice(0, 80) || 'foto';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

function isProfilePhotoInput(input) {
  return input?.matches?.('.profile-gallery input[type="file"], .profile-page-layout input[type="file"], .member-profile-page input[type="file"]');
}

document.addEventListener('change', async (event) => {
  const input = event.target;
  if (!isProfilePhotoInput(input) || processing || input.dataset.ecNormalized === '1') return;
  const file = input.files?.[0];
  if (!file || !String(file.type || '').startsWith('image/')) return;

  const needsNormalization = file.size > NORMALIZE_OVER || !STANDARD_TYPES.has(file.type.toLowerCase());
  if (!needsNormalization) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  processing = true;
  input.disabled = true;
  const originalLabel = input.closest('label');
  const previousText = originalLabel?.childNodes?.[0]?.textContent || '';
  if (originalLabel?.childNodes?.[0]) originalLabel.childNodes[0].textContent = 'Foto wird vorbereitet … ';
  try {
    const converted = await normalize(file);
    if (converted.size > 5 * 1024 * 1024) throw new Error('Das Foto ist auch nach der Optimierung noch größer als 5 MB.');
    const transfer = new DataTransfer();
    transfer.items.add(converted);
    input.files = transfer.files;
    input.dataset.ecNormalized = '1';
    input.disabled = false;
    processing = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    delete input.dataset.ecNormalized;
  } catch (error) {
    input.value = '';
    input.disabled = false;
    processing = false;
    window.alert(`${error?.message || 'Das Foto konnte nicht vorbereitet werden.'}\n\nBitte verwende JPG, PNG oder WebP. Bei iPhone-Fotos hilft es, „Maximale Kompatibilität“ bzw. JPG zu verwenden.`);
  } finally {
    if (originalLabel?.childNodes?.[0] && previousText) originalLabel.childNodes[0].textContent = previousText;
  }
}, true);
