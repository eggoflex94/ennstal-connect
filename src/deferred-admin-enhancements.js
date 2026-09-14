// Heavy admin-only enhancements are intentionally split out of the initial bundle.
// Core navigation, permissions and admin entry points stay eagerly loaded in main.jsx.
const ADMIN_PAGES = new Set([
  'admin',
  'reports',
  'admin-forum',
  'admin-account-review',
  'adminTools',
  'legal'
]);

let adminPromise = null;
let profileAdminPromise = null;

function reportLoadError(area, error) {
  console.warn(`${area} konnten nicht nachgeladen werden:`, error?.message || error);
}

export function loadDeferredAdminEnhancements() {
  if (!adminPromise) {
    adminPromise = Promise.all([
      import('./admin-dashboard-modern.js'),
      import('./admin-compact-enhancements.js'),
      import('./admin-community-popup-manager.js'),
      import('./admin-central-permissions.js'),
      import('./business-account-admin-fix.js'),
      import('./head-admin-activity-folders.js'),
      import('./admin-central-hub.js'),
      import('./admin-reload-watch.js'),
      import('./admin-system-watch.js')
    ]).catch((error) => {
      adminPromise = null;
      reportLoadError('Admin-Erweiterungen', error);
    });
  }
  return adminPromise;
}

export function loadDeferredProfileAdminEnhancements() {
  if (!profileAdminPromise) {
    profileAdminPromise = Promise.all([
      import('./profile-admin-tools-unified.js'),
      import('./profile-admin-role-actions.js'),
      import('./regional-admin-tools-bridge.js')
    ]).catch((error) => {
      profileAdminPromise = null;
      reportLoadError('Profil-Admin-Erweiterungen', error);
    });
  }
  return profileAdminPromise;
}

function onNavigate(event) {
  const page = event?.detail?.page;
  if (ADMIN_PAGES.has(page)) void loadDeferredAdminEnhancements();
  if (page === 'profile' || page === 'profile-preview') void loadDeferredProfileAdminEnhancements();
}

window.addEventListener('ec:navigate', onNavigate);
window.addEventListener('ec:open-profile', () => void loadDeferredProfileAdminEnhancements());

// Some admin pages can be restored from application state without a fresh
// navigation event. Observe only until an admin surface appears, then stop.
const observer = new MutationObserver(() => {
  if (document.querySelector('.admin-page, .ec-admin-workspace, .ec-legal-evidence-admin')) {
    observer.disconnect();
    void loadDeferredAdminEnhancements();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
