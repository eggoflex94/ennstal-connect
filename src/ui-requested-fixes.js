const FRIEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/><path d="M2.5 20c.7-4 2.8-6 5.5-6 3 0 5.2 2 5.7 6M13.5 15c3.2-.7 6 .9 7 5"/></svg>';
const REQUEST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.7-4 3-6 6-6 2 0 3.6.6 4.7 1.8M18 7v7M14.5 10.5h7"/></svg>';

function removeDuplicateAdminCenter() {
  document.querySelectorAll('.ec-sidebar-shell [data-key="admin-center"], .ec-right-dock [data-key="admin-center"]').forEach((node) => node.remove());

  document.querySelectorAll('.ec-admin-block button, .ec-admin-block a, .ec-right-dock button, .ec-right-dock a').forEach((node) => {
    const label = String(node.getAttribute('aria-label') || node.title || node.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (label === 'admin zentrale' || label === 'admin-zentrale') node.remove();
  });
}

function makeFriendIconsVisible() {
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friends"] i').forEach((icon) => {
    icon.innerHTML = FRIEND_ICON;
    icon.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('.ec-sidebar-refactor [data-rf-nav="friend-requests"] i').forEach((icon) => {
    icon.innerHTML = REQUEST_ICON;
    icon.setAttribute('aria-hidden', 'true');
  });
}

function ensureStyles() {
  if (document.getElementById('ec-requested-ui-fixes')) return;
  const style = document.createElement('style');
  style.id = 'ec-requested-ui-fixes';
  style.textContent = `
    .ec-sidebar-refactor [data-rf-nav="friends"] i svg,
    .ec-sidebar-refactor [data-rf-nav="friend-requests"] i svg {
      width: 22px !important;
      height: 22px !important;
      display: block !important;
      fill: none !important;
      stroke: currentColor !important;
      stroke-width: 2 !important;
      stroke-linecap: round !important;
      stroke-linejoin: round !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .ec-pro-friend-badge,
    img[src*="badge-friendship"] {
      width: 22px !important;
      height: 22px !important;
      min-width: 22px !important;
      display: inline-block !important;
      object-fit: contain !important;
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

apply();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
