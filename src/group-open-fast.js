import { supabase } from './supabaseClient';

let groups = [];
let loading = null;
let lastOpenAt = 0;

const groupName = (card) => String(card?.querySelector('h2,h3,.group-card-title')?.textContent || '').trim().toLowerCase();

async function loadGroups(force = false) {
  if (groups.length && !force) return groups;
  if (loading) return loading;
  loading = supabase.from('community_groups').select('id,name,region_id').then(({ data, error }) => {
    loading = null;
    if (error) return groups;
    groups = data || [];
    decorate();
    return groups;
  });
  return loading;
}

function activeRegionValue() {
  return document.querySelector('.ec-region-picker select')?.value || localStorage.getItem('ec-active-region') || '';
}

function findGroupForCard(card) {
  const id = card?.dataset?.groupId;
  if (id) return groups.find(g => g.id === id) || { id };
  const name = groupName(card);
  if (!name) return null;
  const matches = groups.filter(g => String(g.name || '').trim().toLowerCase() === name);
  if (matches.length <= 1) return matches[0] || null;
  const region = activeRegionValue();
  return matches.find(g => g.region_id === region) || matches[0];
}

function decorate() {
  document.querySelectorAll('.groups-page .group-card').forEach(card => {
    const group = findGroupForCard(card);
    if (!group?.id) return;
    card.dataset.groupId = group.id;
    card.classList.add('ec-group-card-ready');
  });
}

function openGroupId(id) {
  if (!id) return;
  const now = Date.now();
  if (now - lastOpenAt < 500) return;
  lastOpenAt = now;
  const url = new URL(location.href);
  if (url.searchParams.get('group') === id) return;
  url.searchParams.set('group', id);
  history.pushState({ ...(history.state || {}), ecGroup: id }, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

document.addEventListener('click', async (event) => {
  const card = event.target.closest('.groups-page .group-card');
  if (!card) return;
  const allowedButton = event.target.closest('.group-details-button,.group-open-full-page');
  const interactive = event.target.closest('input,textarea,select,label,a,button');
  if (interactive && !allowedButton) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  let group = findGroupForCard(card);
  if (!group?.id) {
    await loadGroups();
    group = findGroupForCard(card);
  }
  if (group?.id) openGroupId(group.id);
}, true);

new MutationObserver(() => decorate()).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', () => setTimeout(decorate, 0));
window.addEventListener('ec:region-change', () => setTimeout(decorate, 0));
void loadGroups();

export {};
