import { supabase } from './supabaseClient';
import './profile-photo-album.css';

const BUCKET = 'profile-layout-media';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;

let observer = null;
let observedRoot = null;
let mountTimer = null;
let activePage = null;
let activeProfileId = '';
let currentUserId = '';
let objectUrls = [];
let realtimeChannel = null;
let realtimePhotoIds = new Set();

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function cleanupUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function cleanupRealtime() {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimePhotoIds = new Set();
}

async function viewerId(force = false) {
  if (currentUserId && !force) return currentUserId;
  const { data: { user } } = await supabase.auth.getUser();
  currentUserId = user?.id || '';
  return currentUserId;
}

async function canModerateProfile(profileId) {
  if (!profileId) return false;
  const { data, error } = await supabase.rpc('ec_can_profile_admin_action', {
    p_target_user: profileId,
    p_permission: 'manage_media',
    p_regional_permission: 'MEMBERS',
    p_allow_forum_moderator: false
  });
  return !error && data === true;
}

async function photoUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return '';
  const url = URL.createObjectURL(data);
  objectUrls.push(url);
  return url;
}

async function loadAlbum(profileId, canModerate) {
  const { data: photos, error } = await supabase
    .from('member_photos')
    .select('id,owner_id,image_url,caption,visibility,created_at')
    .eq('owner_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = (photos || []).map((photo) => photo.id);
  if (!ids.length) return { photos: [], likes: [], comments: [], profiles: [], reports: [] };

  const requests = [
    supabase.from('member_photo_likes').select('photo_id,user_id,created_at').in('photo_id', ids),
    supabase.from('member_photo_comments').select('id,photo_id,author_id,content,created_at').in('photo_id', ids).order('created_at', { ascending: true })
  ];
  if (canModerate) requests.push(supabase.from('member_photo_reports').select('id,photo_id,reporter_id,reason,status,created_at').in('photo_id', ids).eq('status', 'OPEN'));
  const [likesResult, commentsResult, reportsResult] = await Promise.all(requests);
  if (likesResult.error) throw likesResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const authorIds = [...new Set((commentsResult.data || []).map((comment) => comment.author_id).filter(Boolean))];
  let profiles = [];
  if (authorIds.length) {
    const profilesResult = await supabase.from('profiles').select('id,nickname,first_name,last_name').in('id', authorIds);
    if (!profilesResult.error) profiles = profilesResult.data || [];
  }
  return {
    photos: photos || [],
    likes: likesResult.data || [],
    comments: commentsResult.data || [],
    profiles,
    reports: reportsResult?.error ? [] : (reportsResult?.data || [])
  };
}

function profileName(profile) {
  return profile?.nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function openLightbox(url, alt) {
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'ec-photo-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<button type="button" class="ec-photo-lightbox-close" aria-label="Foto schließen">×</button><img src="${esc(url)}" alt="${esc(alt || 'Profilfoto')}">`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('.ec-photo-lightbox-close')?.addEventListener('click', close);
  document.body.append(overlay);
}

function subscribeAlbum(profileId, photoIds) {
  cleanupRealtime();
  realtimePhotoIds = new Set(photoIds);
  const shouldRefreshPhotoChild = (payload) => {
    const id = payload?.new?.photo_id || payload?.old?.photo_id;
    return Boolean(id && realtimePhotoIds.has(id));
  };
  realtimeChannel = supabase.channel(`ec-profile-album-${profileId}-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_photos', filter: `owner_id=eq.${profileId}` }, () => scheduleMount(80, true))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_photo_likes' }, (payload) => { if (shouldRefreshPhotoChild(payload)) scheduleMount(80, true); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_photo_comments' }, (payload) => { if (shouldRefreshPhotoChild(payload)) scheduleMount(80, true); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'member_photo_reports' }, (payload) => { if (shouldRefreshPhotoChild(payload)) scheduleMount(100, true); })
    .subscribe();
}

async function renderAlbum(page, profileId) {
  if (!supabase || !page?.isConnected || !profileId) return;
  activePage = page;
  activeProfileId = profileId;
  cleanupUrls();
  const me = await viewerId();
  const mine = me === profileId;
  const canModerate = !mine && await canModerateProfile(profileId);
  if (!page.isConnected) return;

  page.classList.add('ec-has-canonical-album');
  let album = page.querySelector(':scope .ec-profile-photo-album');
  if (!album) {
    album = document.createElement('section');
    album.className = 'ec-profile-photo-album panel';
    const anchor = page.querySelector('.personal-profile-sections') || page.querySelector('.member-profile-content') || page;
    anchor.append(album);
  }
  album.innerHTML = '<div class="ec-photo-album-loading">Fotoalbum wird geladen …</div>';

  try {
    const { photos, likes, comments, profiles, reports } = await loadAlbum(profileId, canModerate);
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const cards = await Promise.all(photos.map(async (photo) => {
      const url = await photoUrl(photo.image_url);
      const photoLikes = likes.filter((like) => like.photo_id === photo.id);
      const liked = photoLikes.some((like) => like.user_id === me);
      const photoComments = comments.filter((comment) => comment.photo_id === photo.id);
      const photoReports = reports.filter((report) => report.photo_id === photo.id);
      const reported = photoReports.length > 0;
      return `<article class="ec-photo-card${reported ? ' is-reported' : ''}" data-photo-id="${esc(photo.id)}">
        <button type="button" class="ec-photo-image-wrap" data-photo-open="${esc(photo.id)}" aria-label="Foto groß anzeigen">
          ${url ? `<img src="${esc(url)}" alt="${esc(photo.caption || 'Profilfoto')}" loading="lazy" decoding="async">` : '<span class="ec-photo-image-error">Foto nicht verfügbar</span>'}
          ${reported && canModerate ? '<span class="ec-photo-report-badge">Gemeldet</span>' : ''}
        </button>
        <div class="ec-photo-card-body">
          ${photo.caption ? `<p class="ec-photo-caption">${esc(photo.caption)}</p>` : ''}
          <small class="ec-photo-visibility">${photo.visibility === 'FRIENDS' ? '👥 Nur Freunde' : '◎ Öffentlich'}</small>
          <div class="ec-photo-actions">
            <button type="button" class="ec-photo-like${liked ? ' active' : ''}" data-photo-like="${esc(photo.id)}" aria-pressed="${liked ? 'true' : 'false'}">${liked ? '♥ Gefällt dir' : '♡ Gefällt mir'} <span>${photoLikes.length}</span></button>
            <span class="ec-photo-comment-count">💬 ${photoComments.length}</span>
            ${!mine ? `<button type="button" class="ec-photo-report" data-photo-report="${esc(photo.id)}">Melden</button>` : ''}
            ${mine ? `<button type="button" class="ec-photo-delete" data-photo-delete="${esc(photo.id)}" data-photo-path="${esc(photo.image_url)}">Entfernen</button>` : ''}
            ${canModerate && reported ? `<button type="button" class="ec-photo-admin-remove" data-photo-admin-remove="${esc(photo.id)}">Als Admin entfernen</button>` : ''}
          </div>
          ${canModerate && reported ? `<div class="ec-photo-report-reasons"><strong>Offene Meldung${photoReports.length > 1 ? 'en' : ''}</strong>${photoReports.map((report) => `<p>${esc(report.reason)}</p>`).join('')}</div>` : ''}
          <div class="ec-photo-comments">${photoComments.map((comment) => `<div class="ec-photo-comment"><strong>${esc(profileName(profileMap.get(comment.author_id)))}</strong><span>${esc(comment.content)}</span></div>`).join('')}</div>
          <form class="ec-photo-comment-form" data-photo-comment-form="${esc(photo.id)}"><input name="comment" maxlength="600" placeholder="Kommentar schreiben …" aria-label="Kommentar schreiben" required><button type="submit">Senden</button></form>
        </div>
      </article>`;
    }));

    album.innerHTML = `<header class="ec-photo-album-head"><div><span class="eyebrow">FOTOALBUM</span><h2>${mine ? 'Mein Fotoalbum' : 'Fotoalbum'}</h2><p>Profilfotos mit Likes, Kommentaren und Meldefunktion.</p></div>${mine ? '<button type="button" class="secondary-button ec-photo-upload-open">+ Foto hinzufügen</button>' : ''}</header>
      ${mine ? `<form class="ec-photo-upload-form" hidden>
        <label>Foto<input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif" required></label>
        <label>Beschreibung<input type="text" name="caption" maxlength="160" placeholder="Optional"></label>
        <label>Sichtbarkeit<select name="visibility"><option value="PUBLIC">Öffentlich</option><option value="FRIENDS">Nur Freunde</option></select></label>
        <div class="ec-photo-upload-actions"><button type="submit">Hochladen</button><button type="button" class="ec-photo-upload-cancel">Abbrechen</button></div>
      </form>` : ''}
      <div class="ec-photo-grid">${cards.join('') || '<p class="ec-photo-empty">Noch keine Fotos im Album.</p>'}</div>`;

    bindAlbum(album, page, profileId, photos);
    subscribeAlbum(profileId, photos.map((photo) => photo.id));
  } catch (error) {
    console.error('Fotoalbum konnte nicht geladen werden:', error);
    album.innerHTML = `<p class="ec-photo-album-error">Fotoalbum konnte nicht geladen werden: ${esc(error?.message || 'Unbekannter Fehler')}</p>`;
  }
}

function bindAlbum(album, page, profileId, photos) {
  const photoById = new Map(photos.map((photo) => [photo.id, photo]));
  album.querySelectorAll('[data-photo-open]').forEach((button) => button.addEventListener('click', () => {
    const photo = photoById.get(button.dataset.photoOpen);
    const img = button.querySelector('img');
    if (img?.src) openLightbox(img.src, photo?.caption || 'Profilfoto');
  }));

  const open = album.querySelector('.ec-photo-upload-open');
  const form = album.querySelector('.ec-photo-upload-form');
  open?.addEventListener('click', () => { form.hidden = false; open.hidden = true; form.elements.photo?.focus(); });
  album.querySelector('.ec-photo-upload-cancel')?.addEventListener('click', () => { form.hidden = true; if (open) open.hidden = false; form.reset(); });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = form.elements.photo?.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_BYTES) return window.alert('Bitte JPG, PNG, WebP oder GIF bis 8 MB auswählen.');
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
    const path = `${profileId}/album/${crypto.randomUUID()}.${extension}`;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const me = await viewerId(true);
      if (me !== profileId) throw new Error('Bitte melde dich erneut an.');
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('member_photos').insert({ owner_id: profileId, image_url: path, caption: String(form.elements.caption?.value || '').trim(), visibility: form.elements.visibility?.value || 'PUBLIC' });
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insertError;
      }
      form.reset();
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Foto konnte nicht hochgeladen werden.');
    } finally {
      submit.disabled = false;
    }
  });

  album.querySelectorAll('[data-photo-like]').forEach((button) => button.addEventListener('click', async () => {
    const photoId = button.dataset.photoLike;
    const me = await viewerId();
    if (!me) return window.alert('Bitte melde dich erneut an.');
    button.disabled = true;
    try {
      const { data, error: readError } = await supabase.from('member_photo_likes').select('photo_id').eq('photo_id', photoId).eq('user_id', me).maybeSingle();
      if (readError) throw readError;
      const result = data
        ? await supabase.from('member_photo_likes').delete().eq('photo_id', photoId).eq('user_id', me)
        : await supabase.from('member_photo_likes').insert({ photo_id: photoId, user_id: me });
      if (result.error) throw result.error;
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Like konnte nicht gespeichert werden.');
      button.disabled = false;
    }
  }));

  album.querySelectorAll('[data-photo-comment-form]').forEach((commentForm) => commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const photoId = commentForm.dataset.photoCommentForm;
    const input = commentForm.elements.comment;
    const content = String(input?.value || '').trim();
    const me = await viewerId();
    if (!me || !content) return;
    const button = commentForm.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await supabase.from('member_photo_comments').insert({ photo_id: photoId, author_id: me, content });
      if (error) throw error;
      input.value = '';
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Kommentar konnte nicht gespeichert werden.');
      button.disabled = false;
    }
  }));

  album.querySelectorAll('[data-photo-report]').forEach((button) => button.addEventListener('click', async () => {
    const reason = window.prompt('Warum möchtest du dieses Foto melden? (mindestens 3 Zeichen)', '');
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 3) return window.alert('Bitte einen Meldegrund mit mindestens 3 Zeichen angeben.');
    const me = await viewerId();
    if (!me) return window.alert('Bitte melde dich erneut an.');
    button.disabled = true;
    try {
      const { error } = await supabase.from('member_photo_reports').insert({ photo_id: button.dataset.photoReport, reporter_id: me, reason: cleanReason, status: 'OPEN' });
      if (error) throw error;
      window.alert('Foto wurde gemeldet. Die Administration prüft die Meldung.');
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Foto konnte nicht gemeldet werden.');
      button.disabled = false;
    }
  }));

  album.querySelectorAll('[data-photo-admin-remove]').forEach((button) => button.addEventListener('click', async () => {
    const reason = window.prompt('Begründung für die Entfernung des gemeldeten Fotos:', 'Verstoß gegen Community-Regeln');
    if (reason === null) return;
    button.disabled = true;
    try {
      const { data: path, error } = await supabase.rpc('admin_remove_reported_member_photo', { p_photo_id: button.dataset.photoAdminRemove, p_reason: reason.trim() });
      if (error) throw error;
      if (path && !/^https?:\/\//i.test(path)) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageError) console.warn('Albumdatei konnte nach Moderation nicht entfernt werden:', storageError.message);
      }
      window.alert('Gemeldetes Foto wurde entfernt. Der Besitzer wurde automatisch benachrichtigt und die Aktion im Admin-Logbuch protokolliert.');
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Gemeldetes Foto konnte nicht entfernt werden.');
      button.disabled = false;
    }
  }));

  album.querySelectorAll('[data-photo-delete]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Dieses Foto wirklich aus dem Album entfernen?')) return;
    button.disabled = true;
    try {
      const photoId = button.dataset.photoDelete;
      const path = button.dataset.photoPath;
      const { error } = await supabase.from('member_photos').delete().eq('id', photoId).eq('owner_id', profileId);
      if (error) throw error;
      if (path && !/^https?:\/\//i.test(path)) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
        if (storageError) console.warn('Albumdatei konnte nicht entfernt werden:', storageError.message);
      }
      await renderAlbum(page, profileId);
    } catch (error) {
      window.alert(error?.message || 'Foto konnte nicht entfernt werden.');
      button.disabled = false;
    }
  }));
}

async function resolveTarget() {
  const memberPage = document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if (memberPage) return { page: memberPage, profileId: memberPage.dataset.profileId || '' };
  const ownPage = document.querySelector('.profile-page-layout');
  if (ownPage) return { page: ownPage, profileId: await viewerId() };
  return null;
}

async function mount(force = false) {
  const target = await resolveTarget();
  if (!target?.page || !target.profileId) {
    cleanupUrls();
    cleanupRealtime();
    activePage?.classList.remove('ec-has-canonical-album');
    activePage = null;
    activeProfileId = '';
    return;
  }
  const { page, profileId } = target;
  const existing = page.querySelector(':scope .ec-profile-photo-album');
  if (!force && activePage === page && activeProfileId === profileId && existing) return;
  await renderAlbum(page, profileId);
}

function scheduleMount(delay = 50, force = false) {
  window.clearTimeout(mountTimer);
  mountTimer = window.setTimeout(() => void mount(force), delay);
}

function attachObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node?.nodeType === Node.ELEMENT_NODE && (
      node.matches?.('.member-profile-page,.profile-page-layout') || node.querySelector?.('.member-profile-page,.profile-page-layout')
    )));
    if (relevant) scheduleMount(40);
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh(force = false) { attachObserver(); scheduleMount(0, force); }
window.addEventListener('ec:navigate', () => refresh());
window.addEventListener('focus', () => scheduleMount(20, true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleMount(20, true); });
supabase.auth.onAuthStateChange(() => {
  currentUserId = '';
  cleanupRealtime();
  window.setTimeout(() => refresh(true), 0);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refresh(), { once: true });
else refresh();

export {};
