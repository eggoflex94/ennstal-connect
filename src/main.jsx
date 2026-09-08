import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

/* Core application styles only. All historic layout/theme stacks were removed from the entrypoint. */
import "./styles.css";

/* Functional enhancers kept because they add behavior, not competing page layouts. */
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

/* Member engagement: online-time rewards plus global/regional admin hours and inactivity statistics. */
import "./admin-hours-statistics.css";
import "./admin-hours-statistics.js";

/* Final profile stability authority: one compact visible member profile and admin tool grid. */
import "./profile-final-stability.css";

/* Additive profile community modules: groups, rides/hikes and role-colored image rings. */
import "./profile-community-modules.css";
import "./profile-community-modules.js";

/* Final interaction authority: correct sidebar clicks, linked nicknames, compact message images and modal admin tools. */
import "./sidebar-interaction-fix.css";
import "./sidebar-interaction-fix.js";

/* Remove duplicate administration/moderation people once the regional responsibility panel is present. */
import "./community-contact-cleanup.js";

/* Login description plus final onboarding/mobile stability authority. */
import "./auth-community-intro.js";
import "./community-stability-final.css";

/* Absolute last CSS authority for phone/tablet layout across community, admin, profiles and messages. */
import "./mobile-authority.css";

/* Person links: online friends stay text-only; responsibilities show small role star + avatar + linked nickname. */
import "./people-links-polish.css";
import "./people-links-polish.js";

/* Final touch/click authority: removes legacy profile responsibility text and prevents hidden mobile layers from blocking taps. */
import "./mobile-interaction-authority.css";

/* Global + regional Community News popups and their admin management surface. */
import "./global-community-news-popup.css";
import "./global-community-news-popup.js";
import "./admin-community-popup-manager.css";
import "./admin-community-popup-manager.js";

/* Final personal dashboard authority: document-flow sidebar, correct profile visits, info and popup management shortcuts. */
import "./personal-dashboard-final-fix.css";
import "./personal-dashboard-final-fix.js";

/* Modern home dashboard action cards for overview and recent activity. */
import "./home-dashboard-modern-buttons.css";
import "./home-dashboard-modern-buttons.js";

/* Global + regional homepage publishing with typography controls and live preview. */
import "./homepage-publishing-modern.css";
import "./homepage-publishing-modern.js";

/* Member directory can show the whole community or only the active region. */
import "./members-all-regions.css";
import "./members-all-regions.js";

/* Final member directory card authority: compact cards and one stable identity row. */
import "./member-directory-card-final.css";

/* Absolute final profile authority: keep only the clean action bar and normalize presence lines. */
import "./profile-action-final-authority.css";

/* Harden profile image uploads and surface useful storage/network errors. */
import "./profile-image-upload-fix.js";
import "./profile-photo-upload-fix.js";

/* Make event publishing explicitly regional and add direct image upload to the event form. */
import "./community-event-region-fix.js";

/* Community-wide runtime guardrails: recover network/UI failures, image fallbacks and stale overlays without redesign. */
import "./community-runtime-stability.css";
import "./community-runtime-stability.js";

/* Role-aware profile design preview and permission-aware Admin-Zentrale. */
import "./profile-design-preview-role.css";
import "./admin-central-modern.css";
import "./admin-central-permissions.js";

/* Final geometry and Admin-Zentrale authority: prevent overlap and style the actual shortcut markup. */
import "./layout-overlap-authority.css";
import "./admin-central-final.css";

/* Restore reliable Head-Admin business-account assignment/removal on member profiles. */
import "./business-account-admin-fix.js";

/* Synchronize dynamic shell heights/layout after React and DOM enhancers finish rendering. */
import "./layout-runtime-sync.js";

/* Absolute final role/responsibility geometry across every region. */
import "./role-responsibility-final.css";

/* Absolute last mobile runtime: if a browser swallows the native tap, synthesize exactly one click. */
import "./mobile-single-tap-fix.js";

/* Final visual safety net: no clipped content, no click shields, predictable dialog stacking. */
import "./layout-integrity-final.css";

/* Final Community/mobile audit authority: readable Community hub, safe mobile nav, no panel collisions. */
import "./community-mobile-final.css";

/* Final mobile audit for Forum, News and Admin-Zentrale. */
import "./mobile-forum-news-admin-final.css";

/* Absolute last responsive authority: readable horizontal mobile navigation and tappable controls. */
import "./mobile-visibility-final.css";

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
      await Promise.all(keys.map(key => caches.delete(key)));
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