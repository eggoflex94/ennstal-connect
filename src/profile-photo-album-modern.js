import { supabase } from './supabaseClient';

let mountedProfileId = null;
let refreshTimer = null;
let modal = null;
let loadingProfileId = null;
let lastRequestedAt = 0;
let observedPage = null;
let profileObserver = null;

const esc = (v) => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const formatTime = (v) => { try { return new Date(v).toLocaleString('de-AT'); } catch { return ''; } };

async function authUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

async function fetchAlbum(ownerId) {
  const [{ data: photos, error: photoError }, { data: me }] = await Promise.all([
    supabase.from('member_photos').select('id,owner_id,image_url,caption,visibility,created_at').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ]);
  if (photoError) throw photoError;
  const ids = (photos || []).map((p) => p.id);
  if (!ids.length) return { photos: [], likes: [], comments: [], people: new Map(), user: me?.user || null };

  const [{ data: likes }, { data: comments }] = await Promise.all([
    supabase.from('member_photo_likes').select('photo_id,user_id,created_at').in('photo_id', ids),
    supabase.from('member_photo_comments').select('id,photo_id,author_id,content,created_at').in('photo_id', ids).order('created_at', { ascending: true }),
  ]);
  const authorIds = [...new Set((comments || []).map((c) => c.author_id).filter(Boolean))];
  const { data: profiles } = authorIds.length
    ? await supabase.from('profiles').select('id,nickname,first_name,last_name,avatar_url').in('id', authorIds)
    : { data: [] };
  return {
    photos: photos || [], likes: likes || [], comments: comments || [],
    people: new Map((profiles || []).map((p) => [p.id, p])),
    user: me?.user || null,
  };
}

function memberName(p) {
  return p?.nickname || [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Mitglied';
}

function openStandaloneImage(src, title = 'Profilfoto') {
  if (!src) return;
  closeAlbum();
  modal = document.createElement('div');
  modal.className = 'ec-photo-album-overlay ec-profile-image-lightbox';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <section class="ec-photo-album-modal ec-profile-image-modal">
      <header><div><span>PROFIL</span><strong>${esc(title)}</strong></div><button type="button" class="ec-photo-album-close" aria-label="Schließen">×</button></header>
      <div class="ec-photo-album-stage ec-profile-image-stage"><img src="${esc(src)}" alt="${esc(title)}" decoding="async"></div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector('.ec-photo-album-close').onclick = closeAlbum;
  modal.onclick = (event) => { if (event.target === modal) closeAlbum(); };
}

function bindProfileImages(page) {
  const heroImage = page.querySelector('.member-profile-hero > img');
  if (heroImage && heroImage.dataset.ecProfileImageOpen !== '1') {
    heroImage.dataset.ecProfileImageOpen = '1';
    heroImage.classList.add('ec-clickable-profile-photo');
    heroImage.setAttribute('role', 'button');
    heroImage.setAttribute('tabindex', '0');
    heroImage.title = 'Profilbild vergrößern';
    const open = () => openStandaloneImage(heroImage.currentSrc || heroImage.src, 'Profilbild');
    heroImage.addEventListener('click', open);
    heroImage.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  }
  page.querySelectorAll('.profile-bio-image').forEach((image) => {
    if (image.dataset.ecProfileImageOpen === '1') return;
    image.dataset.ecProfileImageOpen = '1';
    image.classList.add('ec-clickable-profile-photo');
    image.setAttribute('role', 'button');
    image.setAttribute('tabindex', '0');
    image.title = 'Foto vergrößern';
    const open = () => openStandaloneImage(image.currentSrc || image.src, 'Profilfoto');
    image.addEventListener('click', open);
    image.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  });
}

function renderFolder(page, data) {
  page.querySelector('.ec-profile-photo-folder')?.remove();
  const photos = Array.isArray(data?.photos) ? data.photos : [];
  // Public member profiles should not reserve a large empty card when the
  // member has no visible album photos. The React profile already communicates
  // the absence of optional content through its normal flow.
  if (!photos.length) {
    page.querySelectorAll(':scope > .public-photo-folder').forEach((nativeFolder) => { nativeFolder.hidden = false; });
    bindProfileImages(page);
    return;
  }

  const folder = document.createElement('section');
  folder.className = 'ec-profile-photo-folder';
  folder.dataset.photoFolder = '1';
  const thumbs = photos.slice(0, 6).map((photo) => `
    <button type="button" class="ec-profile-photo-thumb" data-photo-id="${photo.id}" aria-label="Foto öffnen">
      <img src="${esc(photo.image_url)}" alt="${esc(photo.caption || 'Profilfoto')}" loading="lazy" decoding="async">
    </button>`).join('');
  folder.innerHTML = `
    <div class="ec-profile-photo-folder-head">
      <div><span class="ec-profile-photo-folder-icon" aria-hidden="true">▣</span><span><strong>Fotos</strong><small>${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'}</small></span></div>
      <button type="button" class="ec-profile-photo-open-all">Alle ansehen</button>
    </div>
    <div class="ec-profile-photo-preview-grid">${thumbs}</div>
  `;

  const anchor = page.querySelector('.member-profile-actions') || page.querySelector('.member-profile-hero');
  if (anchor) anchor.insertAdjacentElement('afterend', folder);
  else page.appendChild(folder);

  page.querySelectorAll(':scope > .public-photo-folder').forEach((nativeFolder) => { nativeFolder.hidden = true; });
  bindProfileImages(page);
  folder.querySelector('.ec-profile-photo-open-all')?.addEventListener('click', () => openAlbum(page.dataset.profileId, data, photos[0]?.id));
  folder.querySelectorAll('[data-photo-id]').forEach((btn) => btn.addEventListener('click', () => openAlbum(page.dataset.profileId, data, btn.dataset.photoId)));
}

async function toggleLike(photoId, data, ownerId) {
  const user = data.user || await authUser();
  if (!user) return;
  const liked = data.likes.some((l) => l.photo_id === photoId && l.user_id === user.id);
  const result = liked
    ? await supabase.from('member_photo_likes').delete().eq('photo_id', photoId).eq('user_id', user.id)
    : await supabase.from('member_photo_likes').insert({ photo_id: photoId, user_id: user.id });
  if (result.error) return window.alert(result.error.message);
  await refreshOpenAlbum(ownerId, photoId);
}

async function addComment(photoId, text, ownerId) {
  const user = await authUser();
  const content = String(text || '').trim();
  if (!user || content.length < 2) return;
  const { error } = await supabase.from('member_photo_comments').insert({ photo_id: photoId, author_id: user.id, content });
  if (error) return window.alert(error.message);
  await refreshOpenAlbum(ownerId, photoId);
}

async function reportPhoto(photo, ownerId) {
  const user = await authUser();
  if (!user || user.id === ownerId) return;
  const reason = window.prompt('Warum möchtest du dieses Foto melden?', 'Unangemessener Bildinhalt');
  if (reason === null) return;
  const trimmed = reason.trim();
  if (trimmed.length < 3) return window.alert('Bitte gib einen kurzen Grund für die Meldung an.');
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: user.id,
    reported_user_id: ownerId,
    reason: `PROFILFOTO ${photo.id}: ${trimmed}`,
    status: 'PENDING',
  });
  window.alert(error ? error.message : 'Foto wurde zur Prüfung gemeldet.');
}

function openAlbum(ownerId, data, selectedId) {
  closeAlbum();
  const selected = data.photos.find((p) => p.id === selectedId) || data.photos[0];
  if (!selected) return;
  const likes = data.likes.filter((l) => l.photo_id === selected.id);
  const comments = data.comments.filter((c) => c.photo_id === selected.id);
  const liked = Boolean(data.user && likes.some((l) => l.user_id === data.user.id));
  const index = data.photos.findIndex((p) => p.id === selected.id);
  const prev = data.photos[(index - 1 + data.photos.length) % data.photos.length];
  const next = data.photos[(index + 1) % data.photos.length];
  modal = document.createElement('div');
  modal.className = 'ec-photo-album-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <section class="ec-photo-album-modal">
      <header><div><span>FOTOS</span><strong>Profilalbum</strong></div><button type="button" class="ec-photo-album-close" aria-label="Schließen">×</button></header>
      <div class="ec-photo-album-layout">
        <div class="ec-photo-album-stage">
          <button type="button" class="ec-photo-nav prev" aria-label="Vorheriges Foto">‹</button>
          <img src="${esc(selected.image_url)}" alt="${esc(selected.caption || 'Profilfoto')}" decoding="async">
          <button type="button" class="ec-photo-nav next" aria-label="Nächstes Foto">›</button>
        </div>
        <aside class="ec-photo-album-side">
          ${selected.caption ? `<p class="ec-photo-caption">${esc(selected.caption)}</p>` : ''}
          <small>${formatTime(selected.created_at)}</small>
          <div class="ec-photo-social-actions">
            <button type="button" class="ec-photo-like ${liked ? 'is-liked' : ''}">${liked ? '♥ Gefällt dir' : '♡ Gefällt mir'} <span>${likes.length}</span></button>
            ${data.user?.id !== ownerId ? '<button type="button" class="ec-photo-report">⚑ Melden</button>' : ''}
          </div>
          <div class="ec-photo-comment-list">
            ${comments.map((c) => { const p = data.people.get(c.author_id); return `<article><strong>${esc(memberName(p))}</strong><p>${esc(c.content)}</p><small>${formatTime(c.created_at)}</small></article>`; }).join('') || '<p class="ec-photo-no-comments">Noch keine Kommentare.</p>'}
          </div>
          <form class="ec-photo-comment-form"><input name="comment" maxlength="500" placeholder="Kommentar schreiben …" required><button type="submit">Senden</button></form>
        </aside>
      </div>
      <footer>${index + 1} / ${data.photos.length}</footer>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector('.ec-photo-album-close').onclick = closeAlbum;
  modal.onclick = (e) => { if (e.target === modal) closeAlbum(); };
  modal.querySelector('.prev').onclick = () => openAlbum(ownerId, data, prev.id);
  modal.querySelector('.next').onclick = () => openAlbum(ownerId, data, next.id);
  modal.querySelector('.ec-photo-like').onclick = () => toggleLike(selected.id, data, ownerId);
  modal.querySelector('.ec-photo-report')?.addEventListener('click', () => reportPhoto(selected, ownerId));
  modal.querySelector('.ec-photo-comment-form').onsubmit = async (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.comment;
    const text = input.value;
    input.disabled = true;
    await addComment(selected.id, text, ownerId);
  };
}

function closeAlbum() {
  modal?.remove();
  modal = null;
}

async function refreshOpenAlbum(ownerId, selectedId) {
  const data = await fetchAlbum(ownerId);
  const page = document.querySelector(`.member-profile-page[data-profile-id="${CSS.escape(ownerId)}"]`);
  if (page) renderFolder(page, data);
  openAlbum(ownerId, data, selectedId);
}

async function mountFolder(force = false) {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) {
    mountedProfileId = null;
    loadingProfileId = null;
    return;
  }
  const ownerId = page.dataset.profileId;
  if (!ownerId) return;
  bindProfileImages(page);
  if (!force && mountedProfileId === ownerId && (page.querySelector('.ec-profile-photo-folder') || page.dataset.ecPhotoAlbumEmpty === '1')) return;
  if (loadingProfileId === ownerId) return;
  const now = Date.now();
  if (!force && now - lastRequestedAt < 350) return;

  loadingProfileId = ownerId;
  lastRequestedAt = now;
  try {
    const data = await fetchAlbum(ownerId);
    if (!page.isConnected || page.dataset.profileId !== ownerId) return;
    renderFolder(page, data);
    page.dataset.ecPhotoAlbumEmpty = data.photos?.length ? '0' : '1';
    mountedProfileId = ownerId;
  } catch (error) {
    console.warn('Foto-Ordner konnte nicht geladen werden:', error?.message || error);
    page.dataset.ecPhotoAlbumEmpty = '1';
    page.querySelector('.ec-profile-photo-folder')?.remove();
  } finally {
    if (loadingProfileId === ownerId) loadingProfileId = null;
  }
}

function schedule(delay = 40, force = false) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void mountFolder(force), delay);
}

function detectProfilePage() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (page === observedPage) {
    if (page) bindProfileImages(page);
    return;
  }
  observedPage = page || null;
  mountedProfileId = null;
  loadingProfileId = null;
  if (page) {
    delete page.dataset.ecPhotoAlbumEmpty;
    schedule(0, true);
  }
}

function startProfileObserver() {
  if (profileObserver) return;
  const root = document.querySelector('.modern-main') || document.getElementById('root');
  if (!root) return;
  profileObserver = new MutationObserver(detectProfilePage);
  profileObserver.observe(root, { childList: true, subtree: true });
  detectProfilePage();
}

window.addEventListener('ec:navigate', () => { detectProfilePage(); schedule(30, true); });
window.addEventListener('focus', () => { detectProfilePage(); schedule(80, false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) closeAlbum(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startProfileObserver, { once: true });
else startProfileObserver();
