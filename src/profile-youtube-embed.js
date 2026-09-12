import { supabase } from './supabaseClient';
import './profile-youtube-embed.css';

let observer = null;
let observedRoot = null;
let timer = null;
let activeProfileId = '';
let activePage = null;
let currentUserId = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

function youtubeId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./,'').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}

async function viewerId(force = false) {
  if (currentUserId && !force) return currentUserId;
  const { data: { user } } = await supabase.auth.getUser();
  currentUserId = user?.id || '';
  return currentUserId;
}

function findAboutAnchor(page) {
  const candidates = [...page.querySelectorAll('section,article,div')];
  const about = candidates.find((node) => {
    const heading = String(node.querySelector?.(':scope > h2, :scope > div > h2')?.textContent || '').trim().toLowerCase();
    return heading === 'über mich' || heading === 'das bin ich';
  });
  return about || page.querySelector('.personal-profile-sections') || page.querySelector('.profile-form') || page.querySelector('.ec-mp-actions') || page.querySelector('.ec-mp-card') || page;
}

async function resolveTarget() {
  const memberPage = document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if (memberPage) return { page: memberPage, profileId: memberPage.dataset.profileId || '' };
  const ownPage = document.querySelector('.profile-page-layout');
  if (ownPage) return { page: ownPage, profileId: await viewerId() };
  return null;
}

async function saveVideo(panel, page, profileId, items) {
  const form = panel.querySelector('.ec-profile-youtube-form');
  if (!form) return;
  const input = form.querySelector('[name="youtube_link"]');
  const titleInput = form.querySelector('[name="youtube_title"]');
  const status = form.querySelector('.ec-profile-youtube-status');
  const button = form.querySelector('button[type="submit"]');
  const id = youtubeId(input?.value);
  if (!id) {
    if (status) status.textContent = 'Bitte einen gültigen YouTube-Link einfügen.';
    input?.focus();
    return;
  }
  button.disabled = true;
  if (status) status.textContent = 'Video wird gespeichert …';
  const payload = {
    owner_id: profileId,
    kind: 'YOUTUBE',
    title: String(titleInput?.value || '').trim(),
    body: `https://www.youtube.com/watch?v=${id}`,
    visibility: 'PUBLIC',
    appearance: {},
    media_path: null,
    sort_order: items.length + 100
  };
  const { error: saveError } = await supabase.from('profile_sections').insert(payload);
  if (saveError) {
    button.disabled = false;
    if (status) status.textContent = saveError.message || 'Video konnte nicht gespeichert werden.';
    return;
  }
  if (status) status.textContent = '✓ Video gespeichert.';
  await render(page, profileId);
}

async function render(page, profileId) {
  if (!supabase || !page?.isConnected || !profileId) return;
  activeProfileId = profileId;
  activePage = page;
  const me = await viewerId();
  const mine = me === profileId;
  const { data, error } = await supabase.from('profile_sections')
    .select('id,title,body,visibility,sort_order')
    .eq('owner_id', profileId)
    .eq('kind', 'YOUTUBE')
    .order('sort_order', { ascending: true });
  if (error) return;
  const items = (data || []).filter((item) => youtubeId(item.body));

  let panel = page.querySelector(':scope .ec-profile-youtube-panel');
  if (!items.length && !mine) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'ec-profile-youtube-panel';
    const anchor = findAboutAnchor(page);
    anchor.insertAdjacentElement('afterend', panel);
  }

  const cards = items.map((item) => {
    const id = youtubeId(item.body);
    return `<article class="ec-profile-youtube-card" data-youtube-section-id="${esc(item.id)}">
      ${item.title ? `<h3>${esc(item.title)}</h3>` : ''}
      <div class="ec-profile-youtube-frame"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="${esc(item.title || 'YouTube-Video')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>
      ${mine ? `<button type="button" class="ec-profile-youtube-remove" data-youtube-remove="${esc(item.id)}">Video entfernen</button>` : ''}
    </article>`;
  }).join('');

  panel.innerHTML = `<header class="ec-profile-youtube-head"><div><span>ÜBER MICH · VIDEO</span><h2>YouTube</h2></div></header>
    ${mine ? `<form class="ec-profile-youtube-form">
      <label><span>YouTube-Link</span><input name="youtube_link" type="url" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=… oder https://youtu.be/…" required></label>
      <label><span>Überschrift (optional)</span><input name="youtube_title" type="text" maxlength="100" placeholder="z. B. Mein Lieblingsvideo"></label>
      <div class="ec-profile-youtube-form-actions"><button type="submit" class="ec-profile-youtube-add">Video hinzufügen</button><small class="ec-profile-youtube-status" aria-live="polite"></small></div>
    </form>` : ''}
    <div class="ec-profile-youtube-list">${cards || '<p class="ec-profile-youtube-empty">Noch kein Video hinterlegt.</p>'}</div>`;

  panel.querySelector('.ec-profile-youtube-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveVideo(panel, page, profileId, items);
  });

  panel.querySelectorAll('[data-youtube-remove]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Dieses YouTube-Video aus deinem Profil entfernen?')) return;
    button.disabled = true;
    const { error: removeError } = await supabase.from('profile_sections').delete().eq('id', button.dataset.youtubeRemove).eq('owner_id', profileId);
    if (removeError) { button.disabled = false; return window.alert(removeError.message || 'Video konnte nicht entfernt werden.'); }
    await render(page, profileId);
  }));
}

async function mount(force = false) {
  const target = await resolveTarget();
  if (!target?.page || !target.profileId) {
    activeProfileId = '';
    activePage = null;
    return;
  }
  if (!force && activePage === target.page && activeProfileId === target.profileId && target.page.querySelector(':scope .ec-profile-youtube-panel')) return;
  await render(target.page, target.profileId);
}

function schedule(delay = 40, force = false) {
  clearTimeout(timer);
  timer = setTimeout(() => void mount(force), delay);
}

function attachObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    const relevant = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node?.nodeType === Node.ELEMENT_NODE && (node.matches?.('.member-profile-page,.profile-page-layout') || node.querySelector?.('.member-profile-page,.profile-page-layout'))));
    if (relevant) schedule();
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh(force = false) { attachObserver(); schedule(0, force); }
window.addEventListener('ec:navigate', () => refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(20); });
supabase.auth.onAuthStateChange(() => { currentUserId = ''; setTimeout(() => refresh(true), 0); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
else refresh();
