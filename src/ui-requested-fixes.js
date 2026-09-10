const FRIEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2.5 20c.7-4 2.8-6 5.5-6 3 0 5.2 2 5.7 6M13.5 15c3.2-.7 6 .9 7 5"/></svg>';
const REQUEST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-4 3-6 6-6 2 0 3.6.6 4.7 1.8M18 7v7M14.5 10.5h7"/></svg>';

const text = (node) => String(node?.getAttribute?.('aria-label') || node?.title || node?.textContent || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function removeDuplicateAdminCenter() {
  document.querySelectorAll('[data-key="admin-center"], [data-rf-nav="admin"].ec-duplicate-admin-center').forEach((node) => node.remove());

  document.querySelectorAll('.ec-sidebar-shell button, .ec-sidebar-shell a, .ec-right-dock button, .ec-right-dock a').forEach((node) => {
    const label = text(node);
    if (label === 'admin zentrale' || label === 'admin-zentrale' || label === 'admin center') node.remove();
  });
}

function setSvg(container, svg) {
  if (!container) return;
  container.innerHTML = svg;
  container.setAttribute('aria-hidden', 'true');
  container.classList.add('ec-fixed-friend-icon');
}

function makeFriendIconsVisible() {
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friends"] i, .ec-sidebar-shell [data-key="freunde"] i, .ec-sidebar-shell [data-key="friends"] i').forEach((icon) => setSvg(icon, FRIEND_ICON));
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friend-requests"] i, .ec-sidebar-shell [data-key="anfragen"] i, .ec-sidebar-shell [data-key="friend-requests"] i').forEach((icon) => setSvg(icon, REQUEST_ICON));

  document.querySelectorAll('.ec-right-dock button, .ec-right-dock a').forEach((button) => {
    const label = text(button);
    const icon = button.querySelector('.ec-compact-menu-icon, i, b');
    if (label === 'freunde') setSvg(icon, FRIEND_ICON);
    if (label === 'anfragen' || label.includes('freundschaftsanfragen')) setSvg(icon, REQUEST_ICON);
  });

  document.querySelectorAll('.ec-pro-friend-badge, img[src*="badge-friendship"], img[src*="badge-friend.svg"]').forEach((img) => {
    if (img.tagName !== 'IMG') return;
    img.src = '/badge-friend.svg';
    img.alt = 'Befreundet';
    img.title = 'Befreundet';
    img.classList.add('ec-fixed-friend-badge');
  });
}

function ensureStyles() {
  if (document.getElementById('ec-requested-ui-fixes')) return;
  const style = document.createElement('style');
  style.id = 'ec-requested-ui-fixes';
  style.textContent = `
    .ec-fixed-friend-icon,
    .ec-fixed-friend-icon svg,
    .ec-sidebar-shell [data-key="freunde"] svg,
    .ec-sidebar-shell [data-key="anfragen"] svg,
    .ec-sidebar-refactor [data-rf-nav="friends"] svg,
    .ec-sidebar-refactor [data-rf-nav="friend-requests"] svg {
      width: 22px !important;
      height: 22px !important;
      min-width: 22px !important;
      min-height: 22px !important;
      display: inline-block !important;
      fill: none !important;
      stroke: #102d52 !important;
      stroke-width: 2.2 !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      opacity: 1 !important;
      visibility: visible !important;
      overflow: visible !important;
    }
    .ec-fixed-friend-badge,
    .ec-pro-friend-badge,
    img[src*="badge-friendship"],
    img[src*="badge-friend.svg"] {
      width: 24px !important;
      height: 24px !important;
      min-width: 24px !important;
      min-height: 24px !important;
      display: inline-block !important;
      object-fit: contain !important;
      opacity: 1 !important;
      visibility: visible !important;
      filter: none !important;
      position: relative !important;
      z-index: 3 !important;
    }
    .member-profile-actions .ec-profile-friendship-accepted::before,
    .profile-actions .ec-profile-friendship-accepted::before {
      background-image: url('/badge-friend.svg') !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
  `;
  document.head.appendChild(style);
}

function apply() {
  ensureStyles();
  removeDuplicateAdminCenter();
  makeFriendIconsVisible();
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
else apply();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener('ec:navigate', schedule);
window.addEventListener('focus', schedule);
