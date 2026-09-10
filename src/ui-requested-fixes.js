import './member-trust-profile.js';
import './admin-system-health.js';
import './friendship-symbol-final.css';
import './friendship-card-badges.js';
import './personal-community-hub.js';
import './compact-pro-layout.js';
import './top-nav-active-sync.js';
import './admin-access-placement-final.js';
import './global-community-search.js';
import './member-onboarding.js';
import './sidebar-ad-banners.js';
import './admin-banner-entry.js';
import './mobile-editing-final.js';
import './profile-status-stories.js';

const FRIEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2.5 20c.7-4 2.8-6 5.5-6 3 0 5.2 2 5.7 6M13.5 15c3.2-.7 6 .9 7 5"/></svg>';
const REQUEST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-3.6 2.8-5 6-5 2.1 0 3.8.6 4.8 1.9M18 8v6M15 11h6"/></svg>';

const text = (node) => [node?.getAttribute?.('aria-label'), node?.title, node?.textContent]
  .filter(Boolean)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function isAdminCenterLabel(label) {
  const compact = String(label || '').replace(/[\s\-_]+/g, '');
  return compact.includes('adminzentrale') || compact.includes('admincenter');
}

function removeDuplicateAdminCenter() {
  document.querySelectorAll('[data-key="admin-center"], [data-rf-nav="admin"].ec-duplicate-admin-center').forEach((node) => node.remove());
  document.querySelectorAll('.ec-sidebar-shell button, .ec-sidebar-shell a, .ec-right-dock button, .ec-right-dock a').forEach((node) => {
    if (isAdminCenterLabel(text(node)) && !node.dataset.ecAdminPrimary) node.remove();
  });
}

function setSvg(container, svg, kind) {
  if (!container) return;
  if (container.dataset.ecFixedFriendIcon === kind) return;
  container.innerHTML = svg;
  container.setAttribute('aria-hidden', 'true');
  container.classList.add('ec-fixed-friend-icon');
  container.dataset.ecFixedFriendIcon = kind;
}

function makeFriendIconsVisible() {
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friends"] i, .ec-sidebar-shell [data-key="freunde"] i, .ec-sidebar-shell [data-key="friends"] i').forEach((icon) => setSvg(icon, FRIEND_ICON, 'friends'));
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friend-requests"] i, .ec-sidebar-shell [data-key="anfragen"] i, .ec-sidebar-shell [data-key="friend-requests"] i').forEach((icon) => setSvg(icon, REQUEST_ICON, 'requests'));

  document.querySelectorAll('.ec-right-dock button, .ec-right-dock a').forEach((button) => {
    const label = text(button);
    const icon = button.querySelector('.ec-compact-menu-icon, i, b');
    if (label.includes('freunde') && !label.includes('anfragen')) setSvg(icon, FRIEND_ICON, 'friends');
    if (label.includes('anfragen') || label.includes('freundschaftsanfragen')) setSvg(icon, REQUEST_ICON, 'requests');
  });

  document.querySelectorAll('.ec-pro-friend-badge, img[src*="badge-friendship"], img[src*="badge-friend.svg"]').forEach((img) => {
    if (img.tagName !== 'IMG') return;
    const expected = '/badge-friend.svg?v=20260910b';
    if (!img.src.includes('badge-friend.svg?v=20260910b')) img.src = expected;
    if (img.alt !== 'Befreundet') img.alt = 'Befreundet';
    if (img.title !== 'Befreundet') img.title = 'Befreundet';
    img.classList.add('ec-fixed-friend-badge');
  });
}

const STYLES = `
  .ec-fixed-friend-icon,
  .ec-fixed-friend-icon svg,
  .ec-sidebar-shell [data-key="freunde"] svg,
  .ec-sidebar-shell [data-key="anfragen"] svg,
  .ec-sidebar-refactor [data-rf-nav="friends"] svg,
  .ec-sidebar-refactor [data-rf-nav="friend-requests"] svg {
    width:22px!important;height:22px!important;min-width:22px!important;min-height:22px!important;
    display:inline-block!important;fill:none!important;stroke:#102d52!important;stroke-width:2.2!important;
    stroke-linecap:round!important;stroke-linejoin:round!important;opacity:1!important;visibility:visible!important;overflow:visible!important;
  }
  .ec-fixed-friend-badge,.ec-pro-friend-badge,img[src*="badge-friendship"],img[src*="badge-friend.svg"] {
    width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important;display:inline-block!important;
    object-fit:contain!important;opacity:1!important;visibility:visible!important;filter:none!important;position:relative!important;z-index:3!important;
  }
  .member-profile-actions .ec-profile-friendship-accepted::before,.profile-actions .ec-profile-friendship-accepted::before {
    background-image:url('/badge-friend.svg?v=20260910b')!important;opacity:1!important;visibility:visible!important;
  }
  .ec-right-dock .ec-admin-block,
  .ec-right-dock .ec-dock-admin-slot { min-width:0!important; overflow:visible!important; }
  .ec-right-dock .ec-admin-block button,
  .ec-right-dock .ec-admin-block a,
  .ec-right-dock .ec-dock-admin-slot button,
  .ec-right-dock .ec-dock-admin-slot a,
  .ec-right-dock [data-head-admin-tool] {
    min-width:0!important;max-width:100%!important;white-space:nowrap!important;word-break:normal!important;
    overflow-wrap:normal!important;overflow:hidden!important;text-overflow:ellipsis!important;
  }
  .ec-right-dock [data-head-admin-tool] .ec-compact-menu-label {
    white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important;overflow:hidden!important;text-overflow:ellipsis!important;
  }
  .ec-right-dock .ec-admin-block > div,
  .ec-right-dock .ec-dock-admin-slot { grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important; }
`;

function ensureStyles() {
  if (document.getElementById('ec-requested-ui-fixes')) return;
  const style = document.createElement('style');
  style.id = 'ec-requested-ui-fixes';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function apply() {
  ensureStyles();
  removeDuplicateAdminCenter();
  makeFriendIconsVisible();
}

let retryTimer = null;
function schedule(retries = 6) {
  clearTimeout(retryTimer);
  requestAnimationFrame(() => {
    apply();
    if (retries > 0 && !document.querySelector('.ec-right-dock')) {
      retryTimer = setTimeout(() => schedule(retries - 1), 180);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
else schedule();
window.addEventListener('ec:navigate', () => schedule(4));
window.addEventListener('ec:region-change', () => schedule(4));
window.addEventListener('focus', () => schedule(2));
