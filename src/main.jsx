import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* Core application styles only. All historic layout/theme stacks were removed from the entrypoint. */
import "./styles.css";

/* Functional enhancers kept because they add behavior, not competing page layouts. */
import "./profile-customization.js";
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
import "./notification-center.js";
import "./member-onboarding.js";
import "./admin-workspace.js";
import "./admin-dashboard-modern.js";
import "./admin-compact-enhancements.js";
import "./sidebar-news-popup.js";

/* One regional shell, one clean profile runtime and one clean layout family. */
import "./regional-shell.js";
import "./clean-profile-runtime.js";
import "./clean-layout.css";
import "./clean-components.css";

/* Final role/region authority layer: role-colored frames, compact identities and regional responsibilities. */
import "./role-region-polish.css";
import "./role-region-polish.js";

/* Final personal sidebar authority: compact identity plus modern black/white icon grid. */
import "./sidebar-compact-polish.css";
import "./sidebar-compact-polish.js";

/* Final global identity authority: person references are rendered once as role star + nickname. */
import "./global-role-identity-polish.css";
import "./global-role-identity-polish.js";

/* Final profile/footer authority: compact QR sharing and integrated legal navigation. */
import "./profile-footer-polish.css";

/* Stable personal dashboard: restored admin tools, no nested scroll. */
import "./sidebar-layout-stabilizer.css";
import "./sidebar-layout-stabilizer.js";
import "./sidebar-final-stability.css";
import "./sidebar-final-stability.js";

/* Region-aware admin rights cards: compact images and effective regional roles. */
import "./admin-rights-region-polish.css";
import "./admin-rights-region-polish.js";
import "./admin-role-manager.css";
import "./admin-role-manager.js";

/* Member profile guards: regional role in the active region and hard size limits for the legacy hero fallback. */
import "./member-profile-guard.css";
import "./member-profile-region-polish.js";

/* Last runtime pin: keeps the sidebar role star stable even when other DOM enhancers refresh. */
import "./sidebar-role-pin.js";

/* Final top dashboard authority: visible admin/regional role, admin alerts and online friends. */
import "./dashboard-top-polish.css";
import "./dashboard-top-polish.js";

/* Member engagement: active online-time rewards plus Head-Admin-only hours/inactivity statistics. */
import "./admin-hours-statistics.css";
import "./admin-hours-statistics.js";

/* Final profile stability authority: one compact visible member profile and admin tool grid. */
import "./profile-final-stability.css";

/* Additive profile community modules: groups, rides/hikes and role-colored image rings. */
import "./profile-community-modules.css";
import "./profile-community-modules.js";

/* Final profile identity cleanup: effective role text + star, no nickname in function box, no duplicate action bar. */
import "./profile-role-action-fix.css";
import "./profile-role-action-fix.js";

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Ennstal Connect konnte eine Ansicht nicht laden:", error); }
  render() {
    if (this.state.failed) return <main className="app-recovery"><span>ENNSTAL CONNECT</span><h1>Diese Ansicht konnte nicht geladen werden.</h1><p>Bitte lade die Seite neu. Deine Anmeldung und Daten bleiben erhalten.</p><button onClick={() => window.location.reload()}>Seite neu laden</button></main>;
    return this.props.children;
  }
}

async function removeLegacyAppShell() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key))
      );
    }
  } catch (error) {
    console.warn("Alter App-Cache konnte nicht vollständig entfernt werden:", error);
  }
}

void removeLegacyAppShell();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);