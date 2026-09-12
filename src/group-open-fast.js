import { supabase } from './supabaseClient';

const GROUPS_TTL_MS = 15000;
let groups = [];
let groupsExpiresAt = 0;
let loading = null;
let lastOpenAt = 0;

const groupName = (card) => String(card?.querySelector('h1,h2,h3,.group-card-title')?.textContent || '').trim().toLowerCase();

async function loadGroups(force = false) {
  if (!force && groups.length && groupsExpiresAt > Date.now()) return groups;
  if (!force && loading) return loading;
  loading = supabase.from('community_groups').select('id,name,region_id').then(({ data, error }) => {
    if (error) throw error;
    groups = data || [];
    groupsExpiresAt = Date.now() + GROUPS_TTL_MS;
    return groups;
  }).catch((error) => {
    console.warn('[group-open-fast]', error?.message || error);
    return groups;
  }).finally(() => { loading = null; });
  return loading;
}

function findGroupForCard(card) {
  const id = card?.dataset?.groupId;
  if (id) return groups.find(g => g.id === id) || { id };
  const name = groupName(card);
  if (!name) return null;
  const activeRegion = localStorage.getItem('ec-active-region');
  const matches = groups.filter(g => String(g.name || '').trim().toLowerCase() === name);
  return matches.find(g => !activeRegion || g.region_id === activeRegion) || matches[0] || null;
}

function decorate(root = document) {
  root.querySelectorAll?.('.group-card').forEach(card => {
    const group = findGroupForCard(card);
    if (!group?.id) return;
    card.dataset.groupId = group.id;
    card.classList.add('ec-group-card-ready');
  });
}

async function refreshCards(force = false) {
  await loadGroups(force);
  decorate();
}

function openGroupId(id) {
  if (!id) return;
  const now = Date.now();
  if (now - lastOpenAt < 350) return;
  lastOpenAt = now;
  const url = new URL(location.href);
  if (url.searchParams.get('group') === id) return;
  url.searchParams.set('group', id);
  history.pushState({ ...(history.state || {}), ecGroup: id }, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function handleOpen(event) {
  if (event.type === 'pointerup' && event.pointerType === 'mouse') return;
  const card = event.target.closest?.('.group-card');
  if (!card) return;
  const clickedButton = event.target.closest?.('button');
  const buttonText = String(clickedButton?.textContent || '').trim().toLowerCase();
  const isOpenButton = !clickedButton || clickedButton.matches('.group-details-button,.group-open-full-page') || buttonText === 'details' || buttonText.includes('gruppe öffnen') || buttonText.includes('gruppe ansehen');
  if (!isOpenButton) return;

  let group = findGroupForCard(card);
  if (!group?.id) {
    await loadGroups();
    group = findGroupForCard(card);
  }
  if (!group?.id) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openGroupId(group.id);
}

document.addEventListener('click', handleOpen, true);
document.addEventListener('pointerup', handleOpen, true);
window.addEventListener('ec:navigate', () => void refreshCards());
window.addEventListener('ec:region-change', () => void refreshCards(true));
window.addEventListener('ec:groups-rendered', (event) => {
  if (event.detail?.root) decorate(event.detail.root);
  else void refreshCards();
});
queueMicrotask(() => void refreshCards());

export {};
