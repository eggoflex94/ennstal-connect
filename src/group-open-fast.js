import { supabase } from './supabaseClient';

let groups = [];
let loading = null;
let lastOpenAt = 0;

const groupName = (card) => String(card?.querySelector('h1,h2,h3,.group-card-title')?.textContent || '').trim().toLowerCase();

async function loadGroups(force = false) {
  if (groups.length && !force) return groups;
  if (loading) return loading;
  loading = supabase.from('community_groups').select('id,name,region_id').then(({ data, error }) => {
    loading = null;
    if (!error) groups = data || [];
    decorate();
    return groups;
  });
  return loading;
}

function findGroupForCard(card) {
  const id = card?.dataset?.groupId;
  if (id) return groups.find(g => g.id === id) || { id };
  const name = groupName(card);
  if (!name) return null;
  const matches = groups.filter(g => String(g.name || '').trim().toLowerCase() === name);
  return matches[0] || null;
}

function decorate() {
  document.querySelectorAll('.group-card').forEach(card => {
    const group = findGroupForCard(card);
    if (!group?.id) return;
    card.dataset.groupId = group.id;
    card.classList.add('ec-group-card-ready');
  });
}

function openGroupId(id) {
  if (!id) return;
  const now = Date.now();
  if (now - lastOpenAt < 350) return;
  lastOpenAt = now;
  const url = new URL(location.href);
  url.searchParams.set('group', id);
  history.pushState({ ...(history.state || {}), ecGroup: id }, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function handleOpen(event) {
  const card = event.target.closest('.group-card');
  if (!card) return;
  const clickedButton = event.target.closest('button');
  const buttonText = String(clickedButton?.textContent || '').trim().toLowerCase();
  const isOpenButton = !clickedButton || clickedButton.matches('.group-details-button,.group-open-full-page') || buttonText === 'details' || buttonText.includes('gruppe öffnen') || buttonText.includes('gruppe ansehen');
  if (!isOpenButton) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  let group = findGroupForCard(card);
  if (!group?.id) {
    await loadGroups();
    group = findGroupForCard(card);
  }
  if (group?.id) openGroupId(group.id);
}

document.addEventListener('pointerup', handleOpen, true);
document.addEventListener('click', handleOpen, true);

new MutationObserver(() => decorate()).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', () => setTimeout(decorate, 0));
window.addEventListener('ec:region-change', () => setTimeout(decorate, 0));
void loadGroups();

export {};
