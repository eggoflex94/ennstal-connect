import { supabase } from './supabaseClient';

const ADMIN_STAR = '/role-star-red.svg';
const SUPPORTER_STAR = '/supporter-star.svg';
const BUSINESS_STAR = '/role-star-blue.svg';
const DEFAULT_AVATAR = '/community-default-avatar.png';

let regions = [];
let profiles = [];
let regionalAdmins = [];
let regionalModeration = [];
let currentUserId = null;
let refreshRunning = false;
let lastRefresh = 0;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const role = (profile) => String(profile?.role || 'MEMBER').toUpperCase();
const nickname = (profile) => profile?.nickname || 'Mitglied';
const assignmentsFor = (profile) => regionalAdmins.filter((item) => item.user_id === profile?.id && item.active);
const moderationFor = (profile, regionId = null) => regionalModeration.filter((item) => item.user_id === profile?.id && item.active && (!regionId || item.region_id === regionId));
const isRegionalAdminIn = (profile, regionId) => assignmentsFor(profile).some((item) => item.region_id === regionId);
const isRegionalAdminAnywhere = (profile) => assignmentsFor(profile).length > 0;
const isBusiness = (profile) => String(profile?.account_badge || '').toUpperCase() === 'BUSINESS';
const isPlainMember = (profile) => role(profile) === 'MEMBER' && !isBusiness(profile) && !isRegionalAdminAnywhere(profile) && !moderationFor(profile).length;
const regionName = (regionId) => regions.find((item) => item.id === regionId)?.name || 'Region';

function currentProfile() { return profiles.find((profile) => profile.id === currentUserId) || null; }
const activeRegion = () => { const slug = document.documentElement.dataset.ecRegion || localStorage.getItem('ec-active-region') || ''; return regions.find((item) => item.slug === slug) || regions.find((item) => item.id === currentProfile()?.home_region_id) || regions[0] || null; };

const permissionTasks = (profile, regionId) => {
  const permissions = moderationFor(profile, regionId).flatMap((item) => Array.isArray(item.permissions) ? item.permissions : []);
  const tasks = [];
  if (permissions.some((item) => /forum/i.test(String(item)))) tasks.push('Forum-Moderation');
  if (permissions.some((item) => /group|gruppe/i.test(String(item)))) tasks.push('Gruppen-Moderation');
  return tasks;
};

const roleTheme = (profile, regionId = null) => {
  const base = role(profile);
  if (base === 'HEAD_ADMIN' || base === 'ADMIN' || (regionId && isRegionalAdminIn(profile, regionId))) return 'admin';
  if (base === 'SUPPORTER' || moderationFor(profile, regionId).length || isRegionalAdminAnywhere(profile)) return 'supporter';
  if (isBusiness(profile)) return 'business';
  return 'member';
};
const starFor = (profile, regionId = null) => { const theme = roleTheme(profile, regionId); if (theme === 'admin') return ADMIN_STAR; if (theme === 'supporter') return SUPPORTER_STAR; if (theme === 'business') return BUSINESS_STAR; return ''; };

async function loadContext(force = false) {
  if (!supabase || refreshRunning) return;
  if (!force && Date.now() - lastRefresh < 15000 && profiles.length) return;
  refreshRunning = true;
  try {
    const [{ data: regionRows }, { data: assignmentRows }, { data: moderationRows }, { data: profileRows }, { data: authData }] = await Promise.all([
      supabase.from('regions').select('id,slug,name,short_name,sort_order,is_active').eq('is_active', true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active', true),
      supabase.from('regional_moderation_assignments').select('user_id,region_id,permissions,active').eq('active', true),
      supabase.from('profiles').select('id,nickname,role,home_region_id,account_badge,avatar_url,account_status').eq('account_status', 'ACTIVE'),
      supabase.auth.getUser()
    ]);
    regions = regionRows || []; regionalAdmins = assignmentRows || []; regionalModeration = moderationRows || []; profiles = profileRows || []; currentUserId = authData?.user?.id || null; lastRefresh = Date.now();
  } catch (error) { console.warn('Rollen- und Regionsdarstellung konnte nicht vollständig geladen werden:', error); }
  finally { refreshRunning = false; }
}

function profileForCard(card) { const id = card?.dataset?.memberId; if (id) { const hit = profiles.find((profile) => profile.id === id); if (hit) return hit; } const name = card?.querySelector('.member-nickname')?.textContent?.trim(); return profiles.find((profile) => nickname(profile) === name) || null; }
function identityMarkup(profile, regionId = null, title = '') { if (!profile) return ''; const star = starFor(profile, regionId); return `<span class="ec-role-person" data-profile-id="${esc(profile.id)}"${title ? ` title="${esc(title)}"` : ''}>${star ? `<img class="ec-role-person-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}<strong>${esc(nickname(profile))}</strong></span>`; }
function personMarkup(profile, regionId, tasks = []) { const star = starFor(profile, regionId); const theme = roleTheme(profile, regionId); const title = regionId && isRegionalAdminIn(profile, regionId) ? `Regionaladmin · ${regionName(regionId)}` : tasks.join(', '); return `<article class="ec-region-responsibility-person ec-role-frame-${theme}" data-profile-id="${esc(profile.id)}"><div class="ec-region-responsibility-person-head"${title ? ` title="${esc(title)}"` : ''}>${star ? `<img class="ec-responsibility-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}<img class="ec-responsibility-avatar" src="${esc(profile.avatar_url || DEFAULT_AVATAR)}" alt=""><strong>${esc(nickname(profile))}</strong></div>${tasks.length ? `<ul>${tasks.map((task) => `<li>${esc(task)}</li>`).join('')}</ul>` : ''}</article>`; }
function setHTMLIfChanged(node, html, signature) { if (!node || node.dataset.ecSignature === signature) return; node.dataset.ecSignature = signature; node.innerHTML = html; }
function findSupportHost() { const heading = [...document.querySelectorAll('h1,h2,h3,h4')].find((node) => /Administration\s*&\s*Support|Ansprechpartner/i.test(String(node.textContent || '').trim())); return heading?.closest('section,article,.card,.dashboard-card,.home-card,.panel') || heading?.parentElement || null; }

function renderRegionalResponsibilities() {
  const host = findSupportHost(); if (!host || !profiles.length) return;
  const heading = [...host.querySelectorAll('h1,h2,h3,h4')].find((node) => /Administration|Ansprechpartner/i.test(node.textContent || '')); if (heading && heading.textContent !== 'Administration & Support') heading.textContent = 'Administration & Support';
  let panel = host.querySelector('.ec-team-panel'); if (!panel) { panel = document.createElement('section'); panel.className = 'ec-team-panel'; heading?.insertAdjacentElement('afterend', panel); }
  const operators = profiles.filter((profile) => role(profile) === 'HEAD_ADMIN');
  const globalAdmins = profiles.filter((profile) => role(profile) === 'ADMIN');
  const regionBlocks = regions.map((region) => {
    const regional = profiles.filter((profile) => isRegionalAdminIn(profile, region.id) && !['HEAD_ADMIN', 'ADMIN'].includes(role(profile)));
    const moderators = profiles.filter((profile) => permissionTasks(profile, region.id).length && !regional.includes(profile));
    if (!regional.length && !moderators.length) return '';
    return `<section class="ec-region-responsibility-block"><header><span>REGION</span><h3>${esc(region.name)}</h3></header>${regional.length ? `<div class="ec-region-responsibility-group"><strong class="ec-region-responsibility-label">Regionaladministration</strong>${regional.map((profile) => personMarkup(profile, region.id, ['Administration dieser Region', 'Community-Support', 'Meldungen & regionale Inhalte'])).join('')}</div>` : ''}${moderators.length ? `<div class="ec-region-responsibility-group"><strong class="ec-region-responsibility-label">Moderation</strong>${moderators.map((profile) => personMarkup(profile, region.id, permissionTasks(profile, region.id))).join('')}</div>` : ''}</section>`;
  }).join('');
  const html = `<div class="ec-team-intro ec-responsibility-intro"><div><strong>Support & Ansprechpartner</strong><p>Die Zuständigkeiten sind nach Regionen geordnet. Angezeigt werden nur tatsächlich zugewiesene Admins und Moderatoren.</p></div><a class="ec-team-email" href="mailto:ennstal.connect@gmx.at">✉ E-Mail senden</a></div>${operators.length ? `<section class="ec-region-responsibility-owner"><header><span>BETREIBER</span><h3>Ennstal Connect</h3></header>${operators.map((profile) => personMarkup(profile, null, ['Betreiber & Gesamtverantwortung', 'Datenschutz & Sicherheit', 'Technischer Support'])).join('')}</section>` : ''}${globalAdmins.length ? `<section class="ec-region-responsibility-global"><header><span>ADMINISTRATION</span><h3>Überregional</h3></header>${globalAdmins.map((profile) => personMarkup(profile, null, ['Überregionale Administration', 'Community-Support'])).join('')}</section>` : ''}${regionBlocks || '<p class="ec-region-responsibility-empty">Noch keine regionalen Zuständigkeiten eingetragen.</p>'}`;
  const signature = JSON.stringify({r: regions.map(x=>x.id),a: regionalAdmins,m: regionalModeration,p: profiles.map(x=>[x.id,x.nickname,x.role,x.account_badge,x.avatar_url])});
  setHTMLIfChanged(panel, html, signature); panel.dataset.ecRegionalResponsibilities = 'true';
  [...host.querySelectorAll('p')].filter((p)=>/Noch keine Administration eingetragen/i.test(p.textContent||'')).forEach((p)=>p.remove());
}

function dedupeById(items){return [...new Map(items.map(item=>[item.id,item])).values()]}
function renderModerationPanels() {
  const region = activeRegion(); if (!region) return;
  const forumModerators = dedupeById(profiles.filter((profile) => permissionTasks(profile, region.id).includes('Forum-Moderation')));
  const groupModerators = dedupeById(profiles.filter((profile) => permissionTasks(profile, region.id).includes('Gruppen-Moderation')));
  const groupPanel = document.querySelector('.groups-page .group-moderators');
  if (groupPanel) {
    const html = `<span class="eyebrow">ZUSTÄNDIG FÜR GRUPPEN · ${esc(region.name)}</span><h2>Gruppenmoderation</h2><div class="ec-moderator-identity-list">${groupModerators.length ? groupModerators.map((profile) => identityMarkup(profile, region.id, `Gruppenmoderation · ${region.name}`)).join('') : '<small>Derzeit keine Gruppenmoderation eingetragen.</small>'}</div>`;
    setHTMLIfChanged(groupPanel, html, `g:${region.id}:${groupModerators.map(x=>x.id).join(',')}`);
  }
  const forumPage = document.querySelector('.forum-page');
  if (forumPage) {
    let panel = forumPage.querySelector('.ec-forum-moderator-panel'); if (!panel) { panel = document.createElement('aside'); panel.className = 'ec-forum-moderator-panel panel'; forumPage.querySelector('.page-heading')?.insertAdjacentElement('afterend', panel); }
    const html = `<span class="eyebrow">ZUSTÄNDIG FÜR FORUM · ${esc(region.name)}</span><div class="ec-forum-moderator-line"><h2>Forummoderation</h2><div class="ec-moderator-identity-list">${forumModerators.length ? forumModerators.map((profile) => identityMarkup(profile, region.id, `Forummoderation · ${region.name}`)).join('') : '<small>Derzeit keine Forummoderation eingetragen.</small>'}</div></div>`;
    setHTMLIfChanged(panel, html, `f:${region.id}:${forumModerators.map(x=>x.id).join(',')}`);
  }
  document.querySelectorAll('.ec-moderator-identity-list').forEach(list=>{
    const seen=new Set();
    list.querySelectorAll('.ec-role-person').forEach(person=>{const key=person.dataset.profileId||person.textContent.trim();if(seen.has(key))person.remove();else seen.add(key)});
  });
}

function bindAdminButton(button) { if (button.dataset.ecRolePolishBound === 'true') return; button.dataset.ecRolePolishBound = 'true'; button.addEventListener('click', () => { const target = button.dataset.ecPage; document.body.classList.remove('ec-dock-open'); if (target === 'adminTools') { const entry = document.querySelector('.ec-admin-workspace-entry'); if (entry) return entry.click(); window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'admin' } })); setTimeout(() => document.querySelector('.ec-admin-workspace-entry')?.click(), 180); return; } if (target === 'legal') { const entry = document.querySelector('.ec-legal-entry'); if (entry) return entry.click(); } window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: target === 'legal' ? 'admin' : target } })); }); }
function restoreAdminDock(profile) { const slot = document.querySelector('.ec-dock-admin-slot'); if (!slot || !profile) return; const base = role(profile); const isHead = base === 'HEAD_ADMIN'; const isAdmin = base === 'ADMIN'; if (!isHead && !isAdmin) { if (slot.childElementCount) slot.replaceChildren(); return; } const expected = isHead ? ['admin', 'adminTools', 'legal'] : ['admin']; const existing = [...slot.querySelectorAll('[data-ec-page]')].map((button) => button.dataset.ecPage); if (!expected.every((item) => existing.includes(item))) { slot.innerHTML = `<div class="ec-dock-divider"></div><div class="ec-dock-section-label">ADMINISTRATION</div><button type="button" data-ec-page="admin"><b>⚙</b><span>Admin-Zentrale</span></button>${isHead ? '<button type="button" data-ec-page="adminTools"><b>⌘</b><span>Admin Tools</span></button><button type="button" data-ec-page="legal"><b>⚖</b><span>Beweissicherung</span></button>' : ''}`; } slot.querySelectorAll('[data-ec-page]').forEach(bindAdminButton); }
function renderSidebarIdentity(profile) { if (!profile) return; const region = activeRegion(); const star = starFor(profile, region?.id || null); const heading = document.querySelector('.ec-dock-head strong'); if (heading) { const html = `${star ? `<img class="ec-sidebar-role-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}<span>${esc(nickname(profile))}</span>`; if (heading.dataset.ecSignature !== html) { heading.dataset.ecSignature = html; heading.innerHTML = html; } heading.title = region && isRegionalAdminIn(profile, region.id) ? `Regionaladmin · ${region.name}` : nickname(profile); } restoreAdminDock(profile); }
function applyMemberRoleVisuals() { const region = activeRegion(); document.querySelectorAll('.member-card').forEach((card) => { const profile = profileForCard(card); if (!profile) return; const theme = roleTheme(profile, region?.id || null); card.dataset.roleTheme = theme; card.classList.remove('role-theme-admin', 'role-theme-supporter', 'role-theme-business', 'role-theme-member'); card.classList.add(`role-theme-${theme}`); const star = starFor(profile, region?.id || null); card.querySelectorAll('.ec-card-badge-role,.member-role-star,.ec-inline-role-star').forEach((node) => { if (isPlainMember(profile)) node.style.display = 'none'; else { node.style.removeProperty('display'); const image = node.matches('img') ? node : node.querySelector('img'); if (image && star) image.src = star; } }); const roleImg = card.querySelector('.ec-card-badge-role-img'); if (roleImg) { roleImg.style.display = isPlainMember(profile) ? 'none' : ''; if (star) roleImg.src = star; } }); }
function applyRoleFrames() { const region = activeRegion(); document.querySelectorAll('.member-card').forEach((card) => { const profile = profileForCard(card); if (profile) card.dataset.roleFrame = roleTheme(profile, region?.id || null); }); document.querySelectorAll('.ec-dock-detail-row').forEach((row) => { const profileId = row.dataset.profileId; const profile = profiles.find((item) => item.id === profileId); if (profile) row.dataset.roleFrame = roleTheme(profile, region?.id || null); }); }
function polishInlinePeople() { const region = activeRegion(); const regionId = region?.id || null; document.querySelectorAll('.group-moderator,.role-author,.content-author,.event-author,.forum-reply small,.forum-post-head p strong').forEach((node) => { if(node.closest('.ec-team-panel,.ec-moderator-identity-list,.ec-forum-moderator-panel'))return; const text = String(node.textContent || '').replace(/\s+/g, ' ').trim(); const profile = profiles.find((item) => text.includes(nickname(item))); if (!profile) return; const prefix = /^Erstellt von\b/i.test(text) ? 'Erstellt von ' : /^von\b/i.test(text) ? 'von ' : ''; const dateMatch = text.match(/(\d{1,2}\.\d{1,2}\.\d{2,4}[^]*)$/); const suffix = dateMatch ? ` · ${esc(dateMatch[1].replace(/^·\s*/, ''))}` : ''; node.innerHTML = `${prefix ? `<span class="ec-role-prefix-inline">${esc(prefix.trim())}</span> ` : ''}${identityMarkup(profile, regionId)}${suffix}`; node.classList.add('ec-role-person-row'); }); }
async function syncEverything(force = false) { await loadContext(force); if (!profiles.length) return; renderSidebarIdentity(currentProfile()); applyMemberRoleVisuals(); applyRoleFrames(); renderRegionalResponsibilities(); renderModerationPanels(); polishInlinePeople(); }
function boot() { syncEverything(true); setInterval(() => { if (!document.hidden) syncEverything(false); }, 6000); const observer = new MutationObserver(() => { clearTimeout(window.__ecRoleRegionPolishTimer); window.__ecRoleRegionPolishTimer = setTimeout(() => syncEverything(false), 100); }); observer.observe(document.documentElement, { childList: true, subtree: true }); window.addEventListener('ec:region-change', () => setTimeout(() => syncEverything(true), 30)); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
