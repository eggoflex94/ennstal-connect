import { supabase } from './supabaseClient';

const ADMIN_STAR = '/role-star-red.svg';
const SUPPORTER_STAR = '/supporter-star.svg';
const BUSINESS_STAR = '/role-star-blue.svg';
const DEFAULT_AVATAR = '/community-default-avatar.png';

let regions = [];
let profiles = [];
let regionalAdmins = [];
let currentUserId = null;
let refreshRunning = false;
let lastRefresh = 0;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const role = (profile) => String(profile?.role || 'MEMBER').toUpperCase();
const nickname = (profile) => profile?.nickname || 'Mitglied';
const moderatorTasks = (profile) => {
  const tasks = [];
  if (profile?.forum_moderator) tasks.push('Forum-Moderation');
  if (profile?.group_moderator) tasks.push('Gruppen-Moderation');
  return tasks;
};
const assignmentsFor = (profile) => regionalAdmins.filter((item) => item.user_id === profile?.id && item.active);
const isRegionalAdminIn = (profile, regionId) => assignmentsFor(profile).some((item) => item.region_id === regionId);
const isRegionalAdminAnywhere = (profile) => assignmentsFor(profile).length > 0;
const isPlainMember = (profile) => role(profile) === 'MEMBER' && !profile?.account_badge && !isRegionalAdminAnywhere(profile);
const roleTheme = (profile, regionId = null) => {
  const base = role(profile);
  if (base === 'HEAD_ADMIN' || base === 'ADMIN' || (regionId && isRegionalAdminIn(profile, regionId))) return 'admin';
  if (base === 'SUPPORTER' || isRegionalAdminAnywhere(profile)) return 'supporter';
  if (profile?.account_badge === 'BUSINESS') return 'business';
  return 'member';
};
const starFor = (profile, regionId = null) => {
  const theme = roleTheme(profile, regionId);
  if (theme === 'admin') return ADMIN_STAR;
  if (theme === 'supporter') return SUPPORTER_STAR;
  if (theme === 'business') return BUSINESS_STAR;
  return '';
};
const regionName = (regionId) => regions.find((item) => item.id === regionId)?.name || 'Region';

async function loadContext(force = false) {
  if (!supabase || refreshRunning) return;
  if (!force && Date.now() - lastRefresh < 10000 && profiles.length) return;
  refreshRunning = true;
  try {
    const [{ data: regionRows }, { data: assignmentRows }, { data: profileRows }, { data: authData }] = await Promise.all([
      supabase.from('regions').select('id,slug,name,short_name,sort_order,is_active').eq('is_active', true).order('sort_order'),
      supabase.from('regional_admin_assignments').select('user_id,region_id,active').eq('active', true),
      supabase.from('profiles').select('id,nickname,role,home_region_id,account_badge,avatar_url,forum_moderator,group_moderator,account_status').eq('account_status', 'ACTIVE'),
      supabase.auth.getUser()
    ]);
    regions = regionRows || [];
    regionalAdmins = assignmentRows || [];
    profiles = profileRows || [];
    currentUserId = authData?.user?.id || null;
    lastRefresh = Date.now();
  } catch (error) {
    console.warn('Rollen- und Regionsdarstellung konnte nicht vollständig geladen werden:', error);
  } finally {
    refreshRunning = false;
  }
}

function currentProfile() {
  return profiles.find((profile) => profile.id === currentUserId) || null;
}

function profileForCard(card) {
  const id = card?.dataset?.memberId;
  if (id) {
    const hit = profiles.find((profile) => profile.id === id);
    if (hit) return hit;
  }
  const name = card?.querySelector('.member-nickname')?.textContent?.trim();
  return profiles.find((profile) => nickname(profile) === name) || null;
}

function personMarkup(profile, regionId, tasks = []) {
  const star = starFor(profile, regionId);
  const theme = roleTheme(profile, regionId);
  return `<article class="ec-region-responsibility-person ec-role-frame-${theme}" data-profile-id="${esc(profile.id)}">
    <div class="ec-region-responsibility-person-head">
      ${star ? `<img class="ec-responsibility-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}
      <img class="ec-responsibility-avatar" src="${esc(profile.avatar_url || DEFAULT_AVATAR)}" alt="">
      <strong>${esc(nickname(profile))}</strong>
    </div>
    ${tasks.length ? `<ul>${tasks.map((task) => `<li>${esc(task)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function findSupportHost() {
  const heading = [...document.querySelectorAll('h1,h2,h3,h4')].find((node) => /Administration\s*&\s*Support|Ansprechpartner/i.test(String(node.textContent || '').trim()));
  return heading?.closest('section,article,.card,.dashboard-card,.home-card,.panel') || heading?.parentElement || null;
}

function renderRegionalResponsibilities() {
  const host = findSupportHost();
  if (!host || !profiles.length) return;
  const heading = [...host.querySelectorAll('h1,h2,h3,h4')].find((node) => /Administration|Ansprechpartner/i.test(node.textContent || ''));
  if (heading) heading.textContent = 'Administration & Support';

  let panel = host.querySelector('.ec-team-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'ec-team-panel';
    heading?.insertAdjacentElement('afterend', panel);
  }

  const operators = profiles.filter((profile) => role(profile) === 'HEAD_ADMIN');
  const globalAdmins = profiles.filter((profile) => role(profile) === 'ADMIN');
  const regionBlocks = regions.map((region) => {
    const regional = profiles.filter((profile) => isRegionalAdminIn(profile, region.id) && role(profile) !== 'HEAD_ADMIN' && role(profile) !== 'ADMIN');
    const moderators = profiles.filter((profile) => {
      if (role(profile) !== 'SUPPORTER') return false;
      if (!moderatorTasks(profile).length) return false;
      if (isRegionalAdminIn(profile, region.id)) return false;
      return profile.home_region_id === region.id;
    });
    if (!regional.length && !moderators.length) return '';
    return `<section class="ec-region-responsibility-block">
      <header><span>REGION</span><h3>${esc(region.name)}</h3></header>
      ${regional.length ? `<div class="ec-region-responsibility-group"><strong class="ec-region-responsibility-label">Regional zuständig</strong>${regional.map((profile) => personMarkup(profile, region.id, ['Administration dieser Region', 'Community-Support', 'Meldungen & regionale Inhalte'])).join('')}</div>` : ''}
      ${moderators.length ? `<div class="ec-region-responsibility-group"><strong class="ec-region-responsibility-label">Moderation</strong>${moderators.map((profile) => personMarkup(profile, region.id, moderatorTasks(profile))).join('')}</div>` : ''}
    </section>`;
  }).join('');

  panel.innerHTML = `<div class="ec-team-intro ec-responsibility-intro"><div><strong>Support & Ansprechpartner</strong><p>Die Zuständigkeiten sind nach Regionen geordnet. Angezeigt werden nur tatsächlich zuständige Admins und Moderatoren.</p></div><a class="ec-team-email" href="mailto:ennstal.connect@gmx.at">✉ E-Mail senden</a></div>
    ${operators.length ? `<section class="ec-region-responsibility-owner"><header><span>BETREIBER</span><h3>Ennstal Connect</h3></header>${operators.map((profile) => personMarkup(profile, null, ['Betreiber & Gesamtverantwortung', 'Datenschutz & Sicherheit', 'Technischer Support'])).join('')}</section>` : ''}
    ${globalAdmins.length ? `<section class="ec-region-responsibility-global"><header><span>ADMINISTRATION</span><h3>Überregional</h3></header>${globalAdmins.map((profile) => personMarkup(profile, null, ['Überregionale Administration', 'Community-Support'])).join('')}</section>` : ''}
    ${regionBlocks || '<p class="ec-region-responsibility-empty">Noch keine regionalen Zuständigkeiten eingetragen.</p>'}`;

  panel.dataset.ecRegionalResponsibilities = 'true';
}

function bindAdminButton(button) {
  if (button.dataset.ecRolePolishBound === 'true') return;
  button.dataset.ecRolePolishBound = 'true';
  button.addEventListener('click', () => {
    const target = button.dataset.ecPage;
    document.body.classList.remove('ec-dock-open');
    if (target === 'adminTools') {
      const entry = document.querySelector('.ec-admin-workspace-entry');
      if (entry) return entry.click();
      window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: 'admin' } }));
      setTimeout(() => document.querySelector('.ec-admin-workspace-entry')?.click(), 180);
      return;
    }
    if (target === 'legal') {
      const entry = document.querySelector('.ec-legal-entry');
      if (entry) return entry.click();
    }
    window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page: target === 'legal' ? 'admin' : target } }));
  });
}

function restoreAdminDock(profile) {
  const slot = document.querySelector('.ec-dock-admin-slot');
  if (!slot || !profile) return;
  const base = role(profile);
  const isHead = base === 'HEAD_ADMIN';
  const isAdmin = base === 'ADMIN';
  if (!isHead && !isAdmin) {
    slot.replaceChildren();
    return;
  }
  const expected = isHead ? ['admin', 'adminTools', 'legal'] : ['admin'];
  const existing = [...slot.querySelectorAll('[data-ec-page]')].map((button) => button.dataset.ecPage);
  if (!expected.every((item) => existing.includes(item))) {
    slot.innerHTML = `<div class="ec-dock-divider"></div><div class="ec-dock-section-label">ADMINISTRATION</div>
      <button type="button" data-ec-page="admin"><b>⚙</b><span>Admin-Zentrale</span></button>
      ${isHead ? '<button type="button" data-ec-page="adminTools"><b>⌘</b><span>Admin Tools</span></button><button type="button" data-ec-page="legal"><b>⚖</b><span>Beweissicherung</span></button>' : ''}`;
  }
  slot.querySelectorAll('[data-ec-page]').forEach(bindAdminButton);
}

function renderSidebarIdentity(profile) {
  if (!profile) return;
  const star = starFor(profile);
  const heading = document.querySelector('.ec-dock-head strong');
  if (heading) {
    heading.innerHTML = `${star ? `<img class="ec-sidebar-role-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}<span>${esc(nickname(profile))}</span>`;
  }
  const identity = document.querySelector('.ec-dock-identity');
  if (identity) {
    identity.innerHTML = `<div class="ec-dock-identity-simple">${star ? `<img class="ec-sidebar-role-star" src="${esc(star)}" alt="" aria-hidden="true">` : ''}<strong>${esc(nickname(profile))}</strong></div><em>Heimatregion: <b class="ec-dock-home-region">${esc(regionName(profile.home_region_id))}</b></em>`;
  }
  restoreAdminDock(profile);
}

function applyMemberRoleVisuals() {
  document.querySelectorAll('.member-card').forEach((card) => {
    const profile = profileForCard(card);
    if (!profile) return;
    const theme = roleTheme(profile);
    card.dataset.roleTheme = theme;
    card.classList.remove('role-theme-admin', 'role-theme-supporter', 'role-theme-business', 'role-theme-member');
    card.classList.add(`role-theme-${theme}`);
    const star = starFor(profile);
    card.querySelectorAll('.ec-card-badge-role,.member-role-star,.ec-inline-role-star').forEach((node) => {
      if (isPlainMember(profile)) {
        node.style.display = 'none';
      } else {
        node.style.removeProperty('display');
        const image = node.matches('img') ? node : node.querySelector('img');
        if (image && star) image.src = star;
      }
    });
    const roleImg = card.querySelector('.ec-card-badge-role-img');
    if (roleImg) {
      roleImg.style.display = isPlainMember(profile) ? 'none' : '';
      if (star) roleImg.src = star;
    }
  });

  const own = currentProfile();
  const profileStar = document.querySelector('.profile-role-star');
  if (profileStar && own) {
    profileStar.style.display = isPlainMember(own) ? 'none' : '';
    const star = starFor(own);
    if (star) profileStar.src = star;
  }
}

function applyRoleFrames() {
  document.querySelectorAll('.member-card').forEach((card) => {
    const profile = profileForCard(card);
    if (profile) card.dataset.roleFrame = roleTheme(profile);
  });
  document.querySelectorAll('.ec-dock-detail-row').forEach((row) => {
    const profileId = row.dataset.profileId;
    const profile = profiles.find((item) => item.id === profileId);
    if (profile) row.dataset.roleFrame = roleTheme(profile);
  });
}

async function syncEverything(force = false) {
  await loadContext(force);
  if (!profiles.length) return;
  renderSidebarIdentity(currentProfile());
  applyMemberRoleVisuals();
  applyRoleFrames();
  renderRegionalResponsibilities();
}

function boot() {
  syncEverything(true);
  setInterval(() => {
    if (!document.hidden) syncEverything(false);
  }, 6000);
  const observer = new MutationObserver(() => {
    clearTimeout(window.__ecRoleRegionPolishTimer);
    window.__ecRoleRegionPolishTimer = setTimeout(() => syncEverything(false), 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('ec:region-change', () => setTimeout(() => syncEverything(true), 30));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
