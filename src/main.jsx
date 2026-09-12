import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

import "./styles.css";

import "./profile-customization.js";
import "./support-contacts-modern.css";
import "./support-contacts-modern.js";
import "./admin-online-status.js";
import "./last-name-privacy.js";
import "./last-active-privacy.js";
import "./online-status-sync.js";
import "./mobile-presence-sync.js";
import "./online-reward-tracker.js";
import "./sidebar-reward-progress.css";
import "./sidebar-reward-progress.js";
import "./featured-group-admin.js";
import "./mobile-zoom.js";
import "./ad-form-fix.js";
import "./ad-management.js";
import "./member-extras.js";
import "./legal-evidence-admin.js";
import "./privacy-center.js";
import "./account-deletion-admin.js";
import "./fake-account-admin.css";
import "./fake-account-admin.js";
import "./help-center.js";
import "./notification-center.css";
import "./notification-center.js";
import "./member-onboarding.js";
import "./admin-workspace.css";
import "./admin-workspace.js";
import "./admin-dashboard-modern.js";
import "./admin-compact-enhancements.js";
import "./sidebar-news-popup.js";

import "./regional-shell.js";
import "./top-nav-events-cleanup.js";
import "./profile-visits-realtime.js";
import "./navigation-stability.js";
import "./admin-forum-cross-region.js";
import "./community-engagement-upgrade.js";
import "./event-editor-enhancement.js";
import "./today-updates-popup.js";
import "./sidebar-friends-newsfeed.js";
import "./clean-profile-runtime.js";
import "./clean-layout.css";
import "./clean-components.css";

import "./role-region-polish.css";
import "./role-region-polish.js";
import "./sidebar-compact-polish.css";
import "./sidebar-compact-polish.js";
import "./global-role-identity-polish.css";
import "./global-role-identity-polish.js";
import "./profile-footer-polish.css";

import "./sidebar-layout-stabilizer.css";
import "./sidebar-layout-stabilizer.js";
import "./sidebar-final-stability.css";
import "./sidebar-final-stability.js";

import "./admin-rights-region-polish.css";
import "./admin-rights-region-polish.js";
import "./admin-role-manager.css";
import "./admin-role-manager.js";
import "./member-profile-guard.css";
import "./member-profile-region-polish.js";
import "./sidebar-role-pin.js";

import "./dashboard-top-polish.css";
import "./dashboard-top-polish.js";
import "./admin-hours-statistics.css";
import "./admin-hours-statistics.js";
import "./profile-final-stability.css";
import "./profile-community-modules.css";
import "./profile-community-modules.js";
import "./sidebar-interaction-fix.css";
import "./sidebar-interaction-fix.js";
import "./community-contact-cleanup.js";

import "./auth-community-intro.js";
import "./community-stability-final.css";
import "./mobile-authority.css";
import "./people-links-polish.css";
import "./people-links-polish.js";
import "./mobile-interaction-authority.css";

import "./global-community-news-popup.css";
import "./global-community-news-popup.js";
import "./admin-community-popup-manager.css";
import "./admin-community-popup-manager.js";
import "./personal-dashboard-final-fix.css";
import "./personal-dashboard-final-fix.js";

import "./home-dashboard-modern-buttons.css";
import "./home-dashboard-modern-buttons.js";
import "./community-native-final.css";
import "./home-next-event-region-final.css";

import "./profile-action-final-authority.css";
import "./friendship-badge-profile.css";
import "./friendship-badge-profile.js";
import "./friendship-badge-visibility.css";
import "./profile-image-upload-fix.js";
import "./profile-photo-upload-fix.js";
import "./profile-bio-image-remove.js";
import "./community-event-region-fix.js";
import "./regional-events-authority.css";
import "./regional-events-authority.js";

import "./community-runtime-stability.css";
import "./community-runtime-stability.js";
import "./profile-design-preview-role.css";
import "./admin-central-modern.css";
import "./admin-central-permissions.js";
import "./layout-overlap-authority.css";
import "./admin-central-final.css";
import "./business-account-admin-fix.js";
import "./layout-runtime-sync.js";
import "./role-responsibility-final.css";
import "./layout-integrity-final.css";
import "./community-mobile-final.css";
import "./mobile-forum-news-admin-final.css";
import "./mobile-visibility-final.css";
import "./mobile-nav-runtime.js";

import "./community-event-card-polish.css";
import "./dashboard-mobile-profile-final.css";
import "./standard-theme-variants.css";
import "./standard-theme-rich.css";
import "./standard-theme-runtime.js";
import "./mobile-native-final.css";
import "./dashboard-header-unified.css";
import "./community-support-verification.css";
import "./community-support-verification.js";
import "./automated-message-modern.css";
import "./automated-message-modern.js";
import "./profile-visits-layout.css";
import "./head-admin-menu.js";
import "./head-admin-activity-folders.css";
import "./head-admin-activity-folders.js";
import "./profile-admin-tools-unified.css";
/* Heavy profile Admin Tools load only after a permitted user clicks the button. */
import "./profile-admin-fast-entry.js";
import "./regional-admin-tools-bridge.js";
import "./ui-requested-fixes.js";
import "./home-modern-final.css";
import "./home-modern-final.js";

import "./message-emoji-picker.css";
import "./message-emoji-picker.js";

/* Shared admin hub and colored icon-only dock. */
import "./admin-central-hub.css";
import "./admin-central-hub.js";
import "./dock-icon-color-authority.js";

/* Native upload authority. */
import "./file-upload-authority.css";
import "./friendship-icon-fit.css";

/* Absolute final navigation authority: loaded after every older desktop/mobile layer. */
import "./navigation-cleanup-final.css";
import "./navigation-cleanup-final.js";

/* Absolute final chat styling: legacy message CSS must not override this. */
import "./chat-final-authority.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, detail: "" };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, detail: String(error?.message || error || "Unbekannter Fehler") };
  }

  componentDidCatch(error, info) {
    console.error("Ennstal Connect konnte eine Ansicht nicht laden:", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-recovery">
          <span>ENNSTAL CONNECT</span>
          <h1>Diese Ansicht konnte nicht geladen werden.</h1>
          <p>Bitte lade die Seite neu. Deine Anmeldung und Daten bleiben erhalten.</p>
          {this.state.detail && <p><small>Technischer Hinweis: {this.state.detail}</small></p>}
          <button onClick={() => window.location.reload()}>Seite neu laden</button>
        </main>
      );
    }
    return this.props.children;
  }
}

async function removeLegacyAppShellOnce() {
  const cleanupKey = "ec-legacy-cache-cleanup-v5";
  try {
    if (localStorage.getItem(cleanupKey) === "done") return;
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    localStorage.setItem(cleanupKey, "done");
  } catch (error) {
    console.warn("Alter App-Cache konnte nicht vollständig entfernt werden:", error);
  }
}

void removeLegacyAppShellOnce();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);