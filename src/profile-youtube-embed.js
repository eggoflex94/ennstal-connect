import { supabase } from './supabaseClient';
import './profile-youtube-embed.css';

let observer = null;
let observedRoot = null;
let timer = null;
let activeProfileId = '';
let currentUserId = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

function youtubeId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./,'').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else if (/^\/(embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2] || '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}

async function viewerId() {
  if (currentUserId) return currentUserId;
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
  return about || page.querySelector('.ec-mp-actions') || page.querySelector('.ec-mp-card') || page;
}

async function render(page, profileId) {
  if (!supabase || !page?.isConnected || !profileId) return;
  activeProfileId = profileId;
  const me = await viewerId();
  const mine = me === profileId;
  const { data, error } = await supabase.from('profile_sections')
    .select('id,title,body,visibility,sort_order')
    .eq('owner_id', profileId)
    .eq('kind', 'YOUTUBE')
    .order('sort_order', { ascending: true });
  if (error) return;
  const items = (data || []).filter((item) => youtubeId(item.body));

  let panel = page.querySelector('.ec-profile-youtube-panel');
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

  panel.innerHTML = `<header class="ec-profile-youtube-head"><div><span>ÜBER MICH · VIDEO</span><h2>Video</h2></div>${mine ? '<button type="button" class="ec-profile-youtube-add">+ YouTube-Link</button>' : ''}</header><div class="ec-profile-youtube-list">${cards || '<p class="ec-profile-youtube-empty">Noch kein Video hinterlegt.</p>'}</div>`;

  panel.querySelector('.ec-profile-youtube-add')?.addEventListener('click', async () => {
    const link = window.prompt('YouTube-Link einfügen:', '');
    if (link === null) return;
    const id = youtubeId(link);
    if (!id) return window.alert('Bitte einen gültigen YouTube-Link verwenden.');
    const title = window.prompt('Überschrift für das Video (optional):', '') ?? '';
    const payload = {
      owner_id: profileId,
      kind: 'YOUTUBE',
      title: title.trim(),
      body: `https://www.youtube.com/watch?v=${id}`,
      visibility: 'PUBLIC',
      appearance: {},
      media_path: null,
      sort_order: items.length + 100
    };
    const { error: saveError } = await supabase.from('profile_sections').insert(payload);
    if (saveError) return window.alert(saveError.message || 'Video konnte nicht gespeichert werden.');
    await render(page, profileId);
  });

  panel.querySelectorAll('[data-youtube-remove]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm('Dieses YouTube-Video aus deinem Profil entfernen?')) return;
    button.disabled = true;
    const { error: removeError } = await supabase.from('profile_sections').delete().eq('id', button.dataset.youtubeRemove).eq('owner_id', profileId);
    if (removeError) { button.disabled = false; return window.alert(removeError.message || 'Video konnte nicht entfernt werden.'); }
    await render(page, profileId);
  }));
}

function mount() {
  const page = document.querySelector('.member-profile-page[data-profile-id]:not(.public-profile-preview)');
  if (!page) { activeProfileId = ''; return; }
  const profileId = page.dataset.profileId;
  if (!profileId) return;
  if (activeProfileId === profileId && page.querySelector('.ec-profile-youtube-panel')) return;
  void render(page, profileId);
}

function schedule(delay = 40) {
  clearTimeout(timer);
  timer = setTimeout(mount, delay);
}

function attachObserver() {
  const root = document.querySelector('.content-root') || document.querySelector('.modern-main');
  if (!root || (observer && observedRoot === root)) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    const relevant = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node?.nodeType === Node.ELEMENT_NODE && (node.matches?.('.member-profile-page') || node.querySelector?.('.member-profile-page'))));
    if (relevant) schedule();
  });
  observer.observe(root, { childList: true, subtree: true });
  observedRoot = root;
}

function refresh() { attachObserver(); schedule(0); }
window.addEventListener('ec:navigate', refresh);
window.addEventListener('focus', () => schedule(20));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
else refresh();
