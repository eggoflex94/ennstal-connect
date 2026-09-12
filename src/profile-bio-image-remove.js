import { supabase } from './supabaseClient';

let timer = null;

function storagePathFromPublicUrl(url) {
  const marker = '/storage/v1/object/public/profile-avatars/';
  const value = String(url || '');
  const index = value.indexOf(marker);
  if (index < 0) return null;
  try { return decodeURIComponent(value.slice(index + marker.length)); } catch { return value.slice(index + marker.length); }
}

async function removeBioImage(button, image) {
  if (!supabase || !image) return;
  if (!window.confirm('Über-mich-Foto wirklich entfernen?')) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'Wird entfernt …';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) throw new Error('Bitte zuerst anmelden.');
    const currentUrl = image.currentSrc || image.src || '';
    const { error } = await supabase.from('profiles').update({ bio_image_url: null }).eq('id', user.id);
    if (error) throw error;
    const path = storagePathFromPublicUrl(currentUrl);
    if (path && path.startsWith(`${user.id}/`)) {
      const { error: storageError } = await supabase.storage.from('profile-avatars').remove([path]);
      if (storageError) console.warn('Über-mich-Datei konnte nicht aus Storage entfernt werden:', storageError.message);
    }
    image.remove();
    button.remove();
  } catch (error) {
    window.alert(error?.message || 'Über-mich-Foto konnte nicht entfernt werden.');
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function mount() {
  const image = document.querySelector('.my-profile-card .profile-bio-image');
  if (!image || image.dataset.ecRemoveReady === '1') return;
  image.dataset.ecRemoveReady = '1';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'danger-button ec-bio-image-remove-button';
  button.textContent = 'Über-mich-Foto entfernen';
  button.onclick = () => void removeBioImage(button, image);
  image.insertAdjacentElement('afterend', button);
}

function schedule(delay = 40) {
  clearTimeout(timer);
  timer = setTimeout(mount, delay);
}

window.addEventListener('ec:navigate', () => schedule(30));
window.addEventListener('focus', () => schedule(60));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
