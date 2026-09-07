import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import "./release-final.css";
import "./launch-fixes.css";
import "./profile-simple.css";
import "./profile-customization.js";
import "./support-contacts-modern.js";
import "./support-contacts-modern.css";
import "./homepage-author.css";
import "./profile-tools.css";
import "./admin-online-status.js";
import "./last-name-privacy.js";
import "./last-active-privacy.js";
import "./online-status-sync.js";
import "./featured-group-admin.js";
import "./featured-group-admin.css";
import "./branding-sync.js";
import "./mobile-parity.css";
import "./brand-logo-2026.css";
import "./mobile-desktop-parity-2026.css";
import "./mobile-zoom.js";
import "./auth-compact.css";
import "./ad-form-fix.js";
import "./ad-management.js";
import "./ad-management.css";
import "./member-extras.js";
import "./member-extras.css";
import "./legal-evidence-admin.js";
import "./legal-evidence-admin.css";
import "./privacy-center.js";
import "./privacy-center.css";
import "./account-deletion-admin.js";
import "./account-deletion-admin.css";
import "./help-center.js";
import "./help-center.css";
import "./notification-center.js";
import "./live-notifications.css";
import "./notification-center.css";
import "./member-onboarding.js";
import "./member-onboarding.css";
import "./admin-workspace.js";
import "./admin-workspace.css";
import "./admin-dashboard-modern.js";
import "./admin-dashboard-modern.css";
import "./admin-compact-enhancements.js";
import "./admin-compact-enhancements.css";
import "./mobile-admin-parity.js";
import "./mobile-admin-parity.css";
import "./sidebar-news-popup.js";
import "./sidebar-news-popup.css";
import "./layout-mountain-backgrounds.css";
import "./identity-badges.css";
import "./identity-system.css";
import "./community-sidebar-refactor.css";
import "./sidebar-layout-stability.css";
import "./community-final-runtime.js";
import "./community-final-runtime.css";
import "./community-sidebar-links.js";
import "./community-sidebar-links.css";
import "./profile-editor-wide.css";
import "./legal-footer-modern.css";
import "./supporter-theme.css";
import "./supporter-runtime-fix.js";
import "./mobile-admin-production.css";
import "./profile-editor-stability.css";
import "./member-grid-final.css";
import "./role-theme-lock.css";
import "./member-card-authoritative.css";
import "./brand-regional.css";
import "./regional-shell.css";
import "./regional-shell.js";
import "./profile-overhaul.css";
import "./profile-overhaul.js";
import "./layout-final-fix.css";
import "./community-dock-details.css";
import "./community-dock-details.js";
import "./member-profile-final.js";
import "./member-profile-final.css";
import "./admin-rights-recovery.js";
import "./ui-stability-rescue.css";
import "./site-final-authority.css";
import "./desktop-recovery.css";
import "./stable-app.js";
import "./stable-app.css";
import "./final-ui-lock.js";
import "./final-ui-lock.css";
import "./emergency-production.css";

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
      await Promise.all(keys.filter(key => key.startsWith("ennstal-connect-shell-")).map(key => caches.delete(key)));
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