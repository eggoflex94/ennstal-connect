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
import "./sidebar-dedupe.js";
import "./admin-workspace.js";
import "./admin-workspace.css";

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Ennstal Connect konnte eine Ansicht nicht laden:", error); }
  render() {
    if (this.state.failed) return <main className="app-recovery"><span>ENNSTAL CONNECT</span><h1>Diese Ansicht konnte nicht geladen werden.</h1><p>Bitte lade die Seite neu. Deine Anmeldung und Daten bleiben erhalten.</p><button onClick={() => window.location.reload()}>Seite neu laden</button></main>;
    return this.props.children;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>
);
