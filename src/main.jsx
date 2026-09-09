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
import "./online-reward-tracker.js";
import "./featured-group-admin.js";
import "./mobile-zoom.js";
import "./ad-form-fix.js";
import "./ad-management.js";
import "./member-extras.js";
import "./legal-evidence-admin.js";
import "./privacy-center.js";
import "./account-deletion-admin.js";
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
import "./navigation-stability.js";
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

/* The next regional event will be rendered natively in React. Do not mutate React-owned DOM here. */
import "./home-next-event-region-final.css";

import "./profile-action-final-authority.css";
import "./friendship-badge-profile.css";
import "./friendship-badge-profile.js";
import "./friendship-badge-visibility.css";
import "./profile-image-upload-fix.js";
import "./profile-photo-upload-fix.js";
import "./community-event-region-fix.js";

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
import "./mobile-single-tap-fix.js";
import "./layout-integrity-final.css";
import "./community-mobile-final.css";
import "./mobile-forum-news-admin-final.css";
import "./mobile-visibility-final.css";
import "./mobile-nav-runtime.js";

import "./home-responsibilities-fixed.css";
import "./home-responsibilities-fixed.js";

/* Last visual authority for event rows so controls never collapse into vertical text. */
import "./community-event-card-polish.css";

import "./desktop-on-phone.css";

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
  const cleanupKey = "ec-legacy-cache-cleanup-v3";
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
