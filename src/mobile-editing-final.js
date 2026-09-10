import { supabase } from './supabaseClient';

const STYLE_ID = 'ec-mobile-editing-final-style';
let timer = null;
let busy = false;

function isMobile() {
  return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  @media (max-width:900px), (pointer:coarse) {
    .integrated-profile-view,
    .member-profile-page,
    .my-area-layout,
    .profile-page-layout,
    .profile-form,
    .profile-editor,
    .integrated-profile-form,
    .community-hub form,
    .modern-main form {
      position:relative!important;
      isolation:isolate!important;
      pointer-events:auto!important;
    }

    .integrated-profile-actions,
    .integrated-profile-actions button,
    .profile-form,
    .profile-editor,
    .integrated-profile-form,
    .profile-form-grid,
    .profile-form-grid label,
    .profile-form-grid input,
    .profile-form-grid textarea,
    .profile-form-grid select,
    .profile-form-grid button,
    .community-hub form input,
    .community-hub form textarea,
    .community-hub form select,
    .community-hub form button,
    .modern-main form input,
    .modern-main form textarea,
    .modern-main form select,
    .modern-main form button,
    input[type="file"] {
      pointer-events:auto!important;
      touch-action:auto!important;
    }

    .profile-form-grid input,
    .profile-form-grid textarea,
    .profile-form-grid select,
    .profile-form input,
    .profile-form textarea,
    .profile-form select,
    .profile-editor input,
    .profile-editor textarea,
    .profile-editor select,
    .integrated-profile-form input,
    .integrated-profile-form textarea,
    .integrated-profile-form select,
    .community-hub form input,
    .community-hub form textarea,
    .modern-main form input,
    .modern-main form textarea {
      -webkit-user-select:text!important;
      user-select:text!important;
      caret-color:auto!important;
      opacity:1!important;
      visibility:visible!important;
      font-size:16px!important;
      line-height:1.35!important;
      min-height:46px!important;
      max-width:100%!important;
      box-sizing:border-box!important;
    }

    .profile-form-grid textarea,
    .profile-form textarea,
    .profile-editor textarea,
    .integrated-profile-form textarea,
    .community-hub form textarea,
    .modern-main form textarea {
      min-height:112px!important;
      resize:vertical!important;
    }

    .integrated-profile-form {
      width:100%!important;
      max-width:100%!important;
      padding:16px!important;
      border-radius:18px!important;
      overflow:visible!important;
      z-index:40!important;
    }

    .integrated-profile-form .profile-form-grid {
      display:grid!important;
      grid-template-columns:minmax(0,1fr)!important;
      gap:13px!important;
    }

    .integrated-profile-form .profile-primary-button,
    .integrated-profile-actions .profile-primary-button {
      min-height:48px!important;
      border-radius:12px!important;
      position:relative!important;
      z-index:45!important;
    }

    .ec-mobile-avatar-upload {
      grid-column:1/-1!important;
      display:grid!important;
      gap:8px!important;
      padding:13px!important;
      border:1px solid #d7e1ea!important;
      border-radius:14px!important;
      background:#f8fbfd!important;
      color:#304b65!important;
    }
    .ec-mobile-avatar-upload strong {font-size:13px!important;}
    .ec-mobile-avatar-upload small {color:#758798!important;font-size:12px!important;line-height:1.4!important;}
    .ec-mobile-avatar-upload input[type="file"] {
      display:block!important;
      width:100%!important;
      min-height:48px!important;
      padding:9px!important;
      border:1px solid #cfdbe6!important;
      border-radius:11px!important;
      background:#fff!important;
      color:#263d55!important;
      opacity:1!important;
      visibility:visible!important;
      position:relative!important;
      z-index:60!important;
    }
    .ec-mobile-avatar-status {min-height:17px;color:#356b92!important;font-size:12px!important;font-weight:800!important;}

    input[type="file"]::file-selector-button {
      min-height:36px!important;
      margin-right:9px!important;
      padding:7px 10px!important;
      border:0!important;
      border-radius:9px!important;
      background:#17324a!important;
      color:#fff!important;
      font-weight:800!important;
    }

    .integrated-profile-hero::before,
    .integrated-profile-hero::after,
    .member-profile-page::before,
    .member-profile-page::after,
    .my-profile-card::before,
    .my-profile-card::after {
      pointer-events:none!important;
    }
  }
  `;
  document.head.appendChild(style);
}

function safeName(name) {
  return String(name || 'profile.jpg').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-80);
}

function setControlledValue(input, value) {
  if (!input) return;
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function uploadAvatar(file, status, root) {
  if (busy || !file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    status.textContent = 'Bitte JPG, PNG, WEBP oder GIF auswählen.';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    status.textContent = 'Das Bild ist zu groß. Maximal 8 MB.';
    return;
  }
  busy = true;
  status.textContent = 'Profilbild wird hochgeladen …';
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw authError || new Error('Nicht angemeldet.');
    const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, { upsert: false, cacheControl: '3600' });
    if (uploadError) throw uploadError;
    const publicUrl = supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
    if (updateError) {
      await supabase.storage.from('profile-avatars').remove([path]);
      throw updateError;
    }
    setControlledValue(root.querySelector('input[value][name="avatar_url"], input[name="avatar_url"]'), publicUrl);
    root.querySelectorAll('.integrated-avatar-wrap img,.my-profile-card img,.profile-avatar img').forEach((img) => { img.src = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`; });
    status.textContent = '✓ Profilbild aktualisiert.';
    window.dispatchEvent(new CustomEvent('ec:profile-media-updated', { detail: { avatar_url: publicUrl } }));
  } catch (error) {
    status.textContent = `Upload fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}`;
  } finally {
    busy = false;
  }
}

function addAvatarUpload(form) {
  if (!isMobile() || !form || form.querySelector('.ec-mobile-avatar-upload')) return;
  const heading = String(form.querySelector('.profile-form-heading')?.textContent || '').toUpperCase();
  const isOwnProfile = heading.includes('MEIN PROFIL') || document.querySelector('.my-profile-card');
  if (!isOwnProfile) return;
  const grid = form.querySelector('.profile-form-grid') || form;
  const box = document.createElement('label');
  box.className = 'ec-mobile-avatar-upload';
  const title = document.createElement('strong');
  title.textContent = 'Profilbild direkt vom Handy hochladen';
  const note = document.createElement('small');
  note.textContent = 'Foto auswählen oder direkt mit der Kamera aufnehmen. JPG, PNG, WEBP oder GIF bis 8 MB.';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/gif';
  input.setAttribute('capture', 'environment');
  const status = document.createElement('span');
  status.className = 'ec-mobile-avatar-status';
  input.addEventListener('change', () => void uploadAvatar(input.files?.[0], status, form));
  box.append(title, note, input, status);
  grid.prepend(box);
}

function protectEditorControls(root = document) {
  if (!isMobile()) return;
  root.querySelectorAll('.integrated-profile-form input,.integrated-profile-form textarea,.integrated-profile-form select,.profile-form input,.profile-form textarea,.profile-form select,.profile-editor input,.profile-editor textarea,.profile-editor select,.community-hub form input,.community-hub form textarea,.modern-main form input,.modern-main form textarea,input[type="file"]').forEach((control) => {
    if (control.dataset.ecMobileEditingReady === '1') return;
    control.dataset.ecMobileEditingReady = '1';
    ['pointerdown','touchstart','click'].forEach((name) => control.addEventListener(name, (event) => event.stopPropagation(), { passive: name === 'touchstart' }));
  });
}

function apply() {
  if (!isMobile()) return;
  ensureStyles();
  document.querySelectorAll('.integrated-profile-form,.profile-form').forEach(addAvatarUpload);
  protectEditorControls();
}

function schedule(retries = 10) {
  clearTimeout(timer);
  const run = (left) => {
    apply();
    if (left > 0) timer = setTimeout(() => run(left - 1), 180);
  };
  run(retries);
}

window.addEventListener('ec:navigate', () => schedule(7));
window.addEventListener('ec:open-profile', () => schedule(7));
window.addEventListener('focus', () => schedule(2));
window.addEventListener('resize', () => schedule(2));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
else schedule();
