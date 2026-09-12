import { supabase } from './supabaseClient';
import './profile-photo-album-modern.css';
import './profile-photo-album-modern.js';

// React remains the only owner of file inputs and upload actions. This module
// only normalizes unusual profile-image files immediately before Supabase
// Storage receives them, avoiding a second DOM/upload implementation.
const STANDARD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_EDGE = 2400;

function isProfileImagePath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length === 2) return true; // avatar: user-id/random.ext
  return parts.length >= 3 && ['gallery', 'backgrounds', 'bio'].includes(parts[1]);
}

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
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden.')),
    'image/jpeg',
    .88,
  ));
}

async function normalizeProfileImage(file) {
  const source = await decodeImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('Dieses Bildformat konnte nicht gelesen werden.');
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Bildverarbeitung ist auf diesem Gerät nicht verfügbar.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await toBlob(canvas);
  const base = String(file.name || 'foto').replace(/\.[^.]+$/, '').slice(0, 80) || 'foto';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

if (supabase?.storage && !supabase.storage.__ecProfilePhotoNormalization) {
  const originalFrom = supabase.storage.from.bind(supabase.storage);
  supabase.storage.from = (bucket) => {
    const client = originalFrom(bucket);
    if (bucket !== 'profile-avatars' || !client?.upload) return client;
    const originalUpload = client.upload.bind(client);
    client.upload = async (path, body, options = {}) => {
      let uploadBody = body;
      let uploadOptions = options;
      const type = String(body?.type || '').toLowerCase();
      if (body instanceof File && type.startsWith('image/') && isProfileImagePath(path) && !STANDARD_TYPES.has(type)) {
        try {
          uploadBody = await normalizeProfileImage(body);
          uploadOptions = { ...options, contentType: uploadBody.type };
        } catch (error) {
          return { data: null, error: new Error(`${error?.message || 'Foto konnte nicht vorbereitet werden.'} Bitte JPG, PNG oder WebP verwenden.`) };
        }
      }
      return originalUpload(path, uploadBody, uploadOptions);
    };
    return client;
  };
  supabase.storage.__ecProfilePhotoNormalization = true;
}
