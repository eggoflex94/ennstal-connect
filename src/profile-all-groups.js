import { supabase } from './supabaseClient';

let timer = null;
let busy = false;
let lastKey = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function resolveProfileHost() {
  const publicPage = document.querySelector('.member-profile-page[data-profile-id]');
  if (publicPage) return { host: publicPage, profileId: publicPage.dataset.profileId };
  const ownPage = document.querySelector('.profile-page-layout');
  if (!ownPage) return null;
  const { data: auth } = await supabase.auth.getUser();
  return auth?.user?.id ? { host: ownPage, profileId: auth.user.id } : null;
}

async function loadAllGroups(profileId) {
  const [a, b, groupsResult, regionsResult] = await Promise.all([
    supabase.from('community_group_members').select('group_id').eq('user_id', profileId),
    supabase.from('group_members').select('group_id').eq('user_id', profileId),
    supabase.from('community_groups').select('id,name,description,image_url,region_id,owner_id,created_by,created_at').order('created_at', { ascending: false }),
    supabase.from('regions').select('id,name')
  ]);
  const ids = new Set([...(a.data || []), ...(b.data || [])].map((row) => row.group_id));
  // Group owners/creators must also see their groups, even if an older record is
  // missing from one of the legacy membership tables.
  const groups = (groupsResult.data || []).filter((group) => ids.has(group.id) || group.owner_id === profileId || group.created_by === profileId);
  const regionMap = new Map((regionsResult.data || []).map((region) => [region.id, region.name]));
  return groups.map((group) => ({ ...group, region_name: regionMap.get(group.region_id) || 'Überregional' }));
}

function hideLegacyRegionalGroupBlocks(host, panel) {
  [...host.querySelectorAll('section,article,div')].forEach((node) => {
    if (node === panel || node.contains(panel) || panel.contains(node)) return;
    const heading = node.querySelector?.(':scope > h2, :scope > h3, :scope > .eyebrow');
    const text = String(heading?.textContent || '').trim().toLowerCase();
    if (text === 'gruppen' || text === 'meine gruppen' || text === 'mitglied in gruppen') {
      node.dataset.ecLegacyRegionalGroups = '1';
      node.style.display = 'none';
    }
  });
}

function openGroup(groupId) {
  const url = new URL(location.href);
  url.searchParams.set('group', groupId);
  history.pushState({ ...(history.state || {}), ecGroup: groupId }, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function render(host, profileId, groups) {
  let panel = host.querySelector('[data-ec-all-profile-groups="1"]');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'panel ec-profile-all-groups';
    panel.dataset.ecAllProfileGroups = '1';
    host.append(panel);
  }
  panel.innerHTML = `
    <div class="ec-profile-all-groups-head">
      <div><span class="eyebrow">GRUPPEN</span><h2>Alle Gruppen</h2><p>Alle Gruppenmitgliedschaften – unabhängig von der aktuell ausgewählten Region.</p></div>
      <strong>${groups.length}</strong>
    </div>
    <div class="ec-profile-all-groups-grid">
      ${groups.length ? groups.map((group) => `
        <button type="button" class="ec-profile-group-card" data-group-id="${esc(group.id)}">
          <img src="${esc(group.image_url || '/community-default-avatar.png')}" alt="">
          <span><strong>${esc(group.name)}</strong><small>${esc(group.region_name)}</small><em>${esc(group.description || 'Gruppe öffnen')}</em></span>
          <b aria-hidden="true">›</b>
        </button>`).join('') : '<div class="ec-profile-groups-empty">Noch in keiner Gruppe Mitglied.</div>'}
    </div>`;
  panel.querySelectorAll('[data-group-id]').forEach((button) => {
    button.onclick = () => openGroup(button.dataset.groupId);
  });
  hideLegacyRegionalGroupBlocks(host, panel);
}

async function sync() {
  if (busy) return;
  const resolved = await resolveProfileHost();
  if (!resolved?.profileId || !resolved.host) return;
  const key = `${resolved.profileId}:${resolved.host.className}`;
  if (key === lastKey && resolved.host.querySelector('[data-ec-all-profile-groups="1"]')) return;
  busy = true;
  try {
    const groups = await loadAllGroups(resolved.profileId);
    lastKey = key;
    render(resolved.host, resolved.profileId, groups);
  } catch (error) {
    console.warn('[profile-all-groups]', error?.message || error);
  } finally {
    busy = false;
  }
}

function schedule(delay = 80) {
  clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

new MutationObserver((records) => {
  if (records.every((record) => record.target?.closest?.('[data-ec-all-profile-groups="1"]'))) return;
  schedule();
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:navigate', () => { lastKey = ''; schedule(30); });
window.addEventListener('ec:open-profile', () => { lastKey = ''; schedule(30); });
window.addEventListener('ec:profile-updated', () => { lastKey = ''; schedule(30); });
setTimeout(() => schedule(0), 150);

export {};
