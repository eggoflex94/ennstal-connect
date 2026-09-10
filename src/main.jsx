import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* Core application styles. */
import "./styles.css";
import "./support-contacts-modern.css";
import "./sidebar-reward-progress.css";
import "./fake-account-admin.css";
import "./notification-center.css";
import "./admin-workspace.css";
import "./clean-layout.css";
import "./clean-components.css";
import "./role-region-polish.css";
import "./sidebar-compact-polish.css";
import "./global-role-identity-polish.css";
import "./profile-footer-polish.css";
import "./sidebar-layout-stabilizer.css";
import "./sidebar-final-stability.css";
import "./admin-rights-region-polish.css";
import "./admin-role-manager.css";
import "./member-profile-guard.css";
import "./dashboard-top-polish.css";
import "./admin-hours-statistics.css";
import "./profile-final-stability.css";
import "./profile-community-modules.css";
import "./sidebar-interaction-fix.css";
import "./community-stability-final.css";
import "./people-links-polish.css";
import "./global-community-news-popup.css";
import "./admin-community-popup-manager.css";
import "./personal-dashboard-final-fix.css";
import "./home-dashboard-modern-buttons.css";
import "./community-native-final.css";
import "./home-next-event-region-final.css";
import "./profile-action-final-authority.css";
import "./friendship-badge-profile.css";
import "./friendship-badge-visibility.css";
import "./regional-events-authority.css";
import "./community-runtime-stability.css";
import "./profile-design-preview-role.css";
import "./admin-central-modern.css";
import "./layout-overlap-authority.css";
import "./admin-central-final.css";
import "./role-responsibility-final.css";
import "./layout-integrity-final.css";
import "./home-responsibilities-fixed.css";
import "./community-event-card-polish.css";
import "./standard-theme-variants.css";
import "./standard-theme-rich.css";
import "./dashboard-header-unified.css";
import "./community-engagement-upgrade.css";
import "./home-social-events.css";
import "./event-editor-enhancement.css";
import "./sidebar-friends-newsfeed.css";
import "./today-updates-popup.css";
import "./community-support-verification.css";
import "./automated-message-modern.css";
import "./profile-visits-layout.css";
import "./file-upload-authority.css";

/* Standalone features only. These do not own the core React controls. */
import "./legal-evidence-admin.js";
import "./privacy-center.js";
import "./account-deletion-admin.js";
import "./fake-account-admin.js";
import "./notification-center.js";
import "./admin-workspace.js";
import "./ui-requested-fixes.js";

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
  const cleanupKey = "ec-legacy-cache-cleanup-v4";
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
