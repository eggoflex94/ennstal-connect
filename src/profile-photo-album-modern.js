import { supabase } from './supabaseClient';

let mountedProfileId = null;
let refreshTimer = null;
let modal = null;

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

function renderFolder(page, data) {
  page.querySelector('.ec-profile-photo-folder')?.remove();
  const folder = document.createElement('section');
  folder.className = 'ec-profile-photo-folder';
  folder.dataset.photoFolder = '1';
  const thumbs = data.photos.slice(0, 6).map((photo) => `
    <button type="button" class="ec-profile-photo-thumb" data-photo-id="${photo.id}" aria-label="Foto öffnen">
      <img src="${esc(photo.image_url)}" alt="${esc(photo.caption || 'Profilfoto')}" loading="lazy" decoding="async">
    </button>`).join('');
  folder.innerHTML = `
    <div class="ec-profile-photo-folder-head">
      <div><span class="ec-profile-photo-folder-icon" aria-hidden="true">▣</span><span><strong>Fotos</strong><small>${data.photos.length} ${data.photos.length === 1 ? 'Foto' : 'Fotos'}</small></span></div>
      ${data.photos.length ? '<button type="button" class="ec-profile-photo-open-all">Alle ansehen</button>' : ''}
    </div>
    ${data.photos.length ? `<div class="ec-profile-photo-preview-grid">${thumbs}</div>` : '<p class="ec-profile-photo-empty">Noch keine für dich sichtbaren Fotos.</p>'}
  `;
  page.appendChild(folder);
  folder.querySelector('.ec-profile-photo-open-all')?.addEventListener('click', () => openAlbum(page.dataset.profileId, data, data.photos[0]?.id));
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

async function mountFolder() {
  const page = document.querySelector('.member-profile-page[data-profile-id]');
  if (!page) { mountedProfileId = null; return; }
  const ownerId = page.dataset.profileId;
  if (!ownerId) return;
  if (mountedProfileId === ownerId && page.querySelector('.ec-profile-photo-folder')) return;
  try {
    const data = await fetchAlbum(ownerId);
    renderFolder(page, data);
    mountedProfileId = ownerId;
  } catch (error) {
    console.warn('Foto-Ordner konnte nicht geladen werden:', error?.message || error);
  }
}

function schedule(delay = 80) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void mountFolder(), delay);
}

new MutationObserver(() => schedule(120)).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', () => schedule(40));
window.addEventListener('focus', () => schedule(80));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal) closeAlbum(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);
