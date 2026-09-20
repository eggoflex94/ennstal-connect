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
const PROFILE_ADMIN_PAGES = new Set([
  'profile',
  'profile-preview',
  'member-profile',
  'members'
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
      // admin-compact-enhancements reparents React-owned action rows; keep admin DOM React-owned.

      import('./admin-community-popup-manager.js'),
      import('./admin-central-permissions.js'),
      import('./business-account-admin-fix.js'),
      import('./head-admin-activity-folders.js'),
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
  const page = String(event?.detail?.page || '');
  if (ADMIN_PAGES.has(page)) void loadDeferredAdminEnhancements();
  if (PROFILE_ADMIN_PAGES.has(page)) void loadDeferredProfileAdminEnhancements();
}

window.addEventListener('ec:navigate', onNavigate);
window.addEventListener('ec:open-profile', () => void loadDeferredProfileAdminEnhancements());

function syncDeferredAdminForDom() {
  if (document.querySelector('.admin-page, .ec-admin-workspace, .ec-legal-evidence-admin')) {
    void loadDeferredAdminEnhancements();
  }
  // Member profiles can be opened directly from React state without emitting
  // ec:open-profile. Detect the actual profile surface as a reliable fallback
  // so Head Admin / Admin tools are always mounted when the page appears.
  if (document.querySelector('.member-profile-page[data-profile-id]')) {
    void loadDeferredProfileAdminEnhancements();
  }
}

// Keep this observer lightweight: it only checks whether one of the two admin
// surfaces exists. The imported modules own their own scoped mounting logic.
const observer = new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) =>
    node?.nodeType === Node.ELEMENT_NODE && (
      node.matches?.('.admin-page,.ec-admin-workspace,.ec-legal-evidence-admin,.member-profile-page[data-profile-id]') ||
      node.querySelector?.('.admin-page,.ec-admin-workspace,.ec-legal-evidence-admin,.member-profile-page[data-profile-id]')
    )
  ));
  if (relevant) syncDeferredAdminForDom();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Covers an already-rendered admin/profile surface when this module itself is
// evaluated after React has mounted.
syncDeferredAdminForDom();
