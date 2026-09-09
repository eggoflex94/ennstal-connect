import { supabase } from './supabaseClient';
import { roleIdentity, makeRoleIcon } from './roleIdentity.js';

let cache = { profiles: [], regions: [], assignments: [] };
let loading = false;
let realtimeStarted = false;
let activeRegionHint = null;
let retryTimer = null;

const norm = (value) => String(value || '').trim().toUpperCase();
const nameOf = (member) => member?.nickname || [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'Community-Team';
const idOf = (member) => member?.id || member?.user_id || '';

function responsibilities(member) {
  const role = norm(member?.role);
  const saved = Array.isArray(member?.admin_responsibilities) ? member.admin_responsibilities.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (role === 'HEAD_ADMIN') return [member?.head_admin_responsibilities || 'Gesamtverantwortung, Sicherheit, Regeln & technischer Betrieb'];
  if (role === 'ADMIN') return saved.length ? saved : ['Community-Verwaltung', 'Support & Sicherheit', 'Koordination der Community'];
  const list = [...saved];
  if (member?.forum_moderator && !list.some((x) => /forum/i.test(x))) list.push('Forum-Moderation');
  if (member?.group_moderator && !list.some((x) => /gruppe/i.test(x))) list.push('Gruppen-Moderation');
  return [...new Set(list)];
}

function activeRegion() {
  if (activeRegionHint?.id) return activeRegionHint;
  const heading = document.querySelector('.home-page .page-heading .eyebrow');
  const label = String(heading?.textContent || '').replace(/^REGION\s+/i, '').trim().toLowerCase();
  return cache.regions.find((region) => [region.name, region.short_name, region.slug].filter(Boolean).some((value) => String(value).trim().toLowerCase() === label)) || null;
}

function assignmentsFor(member) {
  const id = idOf(member);
  return cache.assignments.filter((assignment) => assignment.active && assignment.user_id === id);
}

function roleTitle(member, regionId) {
  const role = norm(member?.role);
  if (role === 'HEAD_ADMIN') return 'Hauptadmin';
  if (role === 'ADMIN') {
    const assigned = assignmentsFor(member);
    return assigned.length && assigned.some((item) => item.region_id === regionId) ? 'Regional Admin' : 'Global Admin';
  }
  if (role === 'SUPPORTER') {
    if (member?.forum_moderator && member?.group_moderator) return 'Forum- & Gruppenmoderation';
    if (member?.forum_moderator) return 'Forum-Moderation';
    if (member?.group_moderator) return 'Gruppen-Moderation';
    return 'Supporter';
  }
  return '';
}

function isVisible(member, regionId) {
  const role = norm(member?.role);
  if (role === 'HEAD_ADMIN') return true;
  if (role === 'ADMIN') {
    const assigned = assignmentsFor(member);
    return assigned.length === 0 || assigned.some((item) => item.region_id === regionId);
  }
  if (role === 'SUPPORTER') {
    if (!member?.forum_moderator && !member?.group_moderator && !responsibilities(member).length) return false;
    const assigned = assignmentsFor(member);
    if (assigned.length) return assigned.some((item) => item.region_id === regionId);
    return !member?.home_region_id || member.home_region_id === regionId;
  }
  return false;
}

function personCard(member, regionId) {
  const identity = roleIdentity(member);
  const card = document.createElement('article');
  card.className = `ec-home-fixed-person ec-role-${identity.key}`;
  card.style.setProperty('--ec-role-color', identity.color);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ec-home-fixed-person-head';
  button.title = `Profil von ${nameOf(member)} öffnen`;
  const avatar = document.createElement('img');
  avatar.className = 'ec-home-fixed-avatar';
  avatar.src = member?.avatar_url || '/community-default-avatar.png';
  avatar.alt = '';
  button.appendChild(avatar);

  const text = document.createElement('span');
  text.className = 'ec-home-fixed-person-text';
  const line = document.createElement('span');
  line.className = 'ec-home-fixed-name-line';
  const star = makeRoleIcon(member, 'normal');
  if (star) line.appendChild(star);
  const strong = document.createElement('strong');
  strong.textContent = nameOf(member);
  line.appendChild(strong);
  text.appendChild(line);
  const role = document.createElement('small');
  role.textContent = roleTitle(member, regionId);
  text.appendChild(role);
  button.appendChild(text);
  button.addEventListener('click', () => window.dispatchEvent(new CustomEvent('ec:open-profile', { detail: { profileId: idOf(member), nickname: nameOf(member) } })));
  card.appendChild(button);

  const items = responsibilities(member);
  if (items.length) {
    const list = document.createElement('ul');
    items.forEach((item) => { const li = document.createElement('li'); li.textContent = item; list.appendChild(li); });
    card.appendChild(list);
  }
  return card;
}

function render() {
  const home = document.querySelector('.home-page');
  if (!home) return;
  const region = activeRegion();
  if (!region?.id) return;

  home.querySelectorAll('.ec-home-responsibilities, .ec-home-fixed-responsibilities').forEach((node) => node.remove());

  const section = document.createElement('section');
  section.className = 'ec-home-fixed-responsibilities panel';
  section.dataset.regionId = region.id;
  const header = document.createElement('div');
  header.className = 'ec-home-fixed-head';
  header.innerHTML = `<span class="eyebrow">ZUSTÄNDIGKEITEN</span><h2>Ansprechpartner für ${region.name}</h2><p>Automatisch mit Admin-Rollen, regionalen Zuweisungen und Moderationsrechten gekoppelt.</p>`;
  section.appendChild(header);

  const visible = cache.profiles.filter((member) => norm(member.account_status || 'ACTIVE') !== 'SUSPENDED' && !member.is_test_account && isVisible(member, region.id));
  visible.sort((a, b) => {
    const rank = (m) => norm(m.role) === 'HEAD_ADMIN' ? 1 : norm(m.role) === 'ADMIN' && assignmentsFor(m).length === 0 ? 2 : norm(m.role) === 'ADMIN' ? 3 : 4;
    return rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b), 'de');
  });

  const grid = document.createElement('div');
  grid.className = 'ec-home-fixed-grid';
  visible.forEach((member) => grid.appendChild(personCard(member, region.id)));
  section.appendChild(grid);
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'ec-home-fixed-empty';
    empty.textContent = 'Für diese Region ist derzeit keine Zuständigkeit hinterlegt.';
    section.appendChild(empty);
  }

  const heading = home.querySelector('.page-heading');
  const overview = home.querySelector('.home-dashboard-overview, .personal-dashboard-overview, .engagement-panel');
  if (overview) overview.insertAdjacentElement('afterend', section);
  else if (heading) heading.insertAdjacentElement('afterend', section);
  else home.prepend(section);
}

function mergeProfiles(contacts, extras) {
  const extraById = new Map((extras || []).map((item) => [item.id || item.user_id, item]));
  return (contacts || []).map((contact) => {
    const id = contact.user_id || contact.id;
    return { ...contact, ...(extraById.get(id) || {}), id, user_id: id };
  });
}

async function load() {
  if (!supabase || loading) return;
  loading = true;
  try {
    const [contactsSettled, regionsSettled, assignmentsSettled, extrasSettled] = await Promise.allSettled([
      supabase.rpc('community_moderation_contacts'),
      supabase.from('regions').select('id,slug,name,short_name').eq('is_active', true),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active', true),
      supabase.from('profiles').select('id,home_region_id,admin_responsibilities,head_admin_responsibilities,account_status,is_test_account,account_badge')
    ]);

    const contactsResult = contactsSettled.status === 'fulfilled' ? contactsSettled.value : null;
    const regionsResult = regionsSettled.status === 'fulfilled' ? regionsSettled.value : null;
    const assignmentsResult = assignmentsSettled.status === 'fulfilled' ? assignmentsSettled.value : null;
    const extrasResult = extrasSettled.status === 'fulfilled' ? extrasSettled.value : null;

    if (contactsResult?.error) throw contactsResult.error;
    if (regionsResult?.error) throw regionsResult.error;

    const contacts = contactsResult?.data || [];
    const extras = extrasResult?.error ? [] : (extrasResult?.data || []);
    cache = {
      profiles: mergeProfiles(contacts, extras),
      regions: regionsResult?.data || [],
      assignments: assignmentsResult?.error ? [] : (assignmentsResult?.data || [])
    };
    render();
  } catch (error) {
    console.error('Zuständigkeiten konnten nicht geladen werden:', error);
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; void load(); }, 3000);
  } finally {
    loading = false;
  }
}

function boot() {
  void load();
  if (!realtimeStarted && supabase) {
    realtimeStarted = true;
    const refresh = () => { cache.profiles = []; void load(); };
    supabase.channel('ec-home-fixed-responsibilities-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'regional_admin_assignments' }, refresh)
      .subscribe();
  }
  const observer = new MutationObserver(() => {
    if (!document.querySelector('.home-page')) return;
    if (!document.querySelector('.ec-home-fixed-responsibilities')) {
      if (cache.profiles.length && cache.regions.length) render();
      else void load();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener('ec:region-change', (event) => {
  activeRegionHint = event.detail || null;
  setTimeout(() => { render(); void load(); }, 50);
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
