import React, { useEffect, useRef, useState } from "react";
import "./MobileQuickNav.css";

// Additive navigation only: existing desktop/sidebar controls remain in place.
// All actions use the same React setPage() as the desktop navigation.
const shortcuts = [
  { page: "home", label: "Start", symbol: "⌂" },
  { page: "members", label: "Mitglieder", symbol: "♙" },
  { page: "messages", label: "Chat", symbol: "✉" },
  { page: "community", label: "Community", symbol: "✦" }
];
const extraPages = [
  ["friends", "Freunde"], ["friend-requests", "Anfragen"],
  ["blocked", "Blockiert"], ["notifications", "Aktuelles"],
  ["news", "Neuigkeiten"], ["events", "Events & Eventfotos"], ["marketplace", "Marktplatz"], ["groups", "Gruppen"],
  ["forum", "Forum & Beiträge"], ["profile", "Mein Profil"], ["municipality", "Gemeinden"]
];

export default function MobileQuickNav({ page, onNavigate, isAdmin, onLogout, unread = 0, unreadNotifications = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const closeButtonRef = useRef(null);
  const menuTriggerRef = useRef(null);
  useEffect(() => { setExpanded(false); setMenuQuery(""); }, [page]);
  useEffect(() => {
    if (!expanded) return undefined;
    const close = (event) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return undefined;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      menuTriggerRef.current?.focus();
    };
  }, [expanded]);
  const navigate = (target) => { setExpanded(false); setMenuQuery(""); onNavigate(target); };
  const normalizedQuery = menuQuery.trim().toLocaleLowerCase("de");
  const visiblePages = extraPages.filter(([, label]) => label.toLocaleLowerCase("de").includes(normalizedQuery));
  return (
    <div className="ec-mobile-quicknav">
      {expanded && <div className="ec-mobile-menu-backdrop" onClick={() => setExpanded(false)} aria-hidden="true" />}
      {expanded && <section id="ec-mobile-complete-menu" className="ec-mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Alle Community-Funktionen">
        <div className="ec-mobile-menu-title"><strong>Alle Funktionen</strong><button ref={closeButtonRef} type="button" onClick={() => setExpanded(false)} aria-label="Menü schließen">✕</button></div>
        <label className="ec-mobile-menu-search-label" htmlFor="ec-mobile-menu-search">Funktion suchen</label>
        <input id="ec-mobile-menu-search" className="ec-mobile-menu-search" type="search" autoComplete="off" value={menuQuery} onChange={(event) => setMenuQuery(event.target.value)} placeholder="Mitglieder, Gruppen, Events …" />
        <div className="ec-mobile-menu-grid">
          {visiblePages.map(([target, label]) => <button key={target} type="button" onClick={() => navigate(target)} aria-current={page === target ? "page" : undefined}>{label}{target === "notifications" && unreadNotifications > 0 ? <span className="ec-mobile-count">{unreadNotifications}</span> : null}</button>)}
          {visiblePages.length === 0 && <p className="ec-mobile-menu-empty" role="status">Keine passende Funktion gefunden.</p>}
          {onLogout && !normalizedQuery && <button type="button" onClick={() => { setExpanded(false); onLogout(); }}>⇥ Abmelden</button>}
          {isAdmin && (!normalizedQuery || "admin-zentrale".includes(normalizedQuery)) && <button type="button" onClick={() => navigate("admin")} aria-current={page === "admin" ? "page" : undefined}>♛ Admin-Zentrale</button>}
        </div>
      </section>}
      <nav className="ec-mobile-quicknav-bar" aria-label="Mobile Schnellnavigation">
        {shortcuts.map(({ page: target, label, symbol }) => <button type="button" key={target} onClick={() => navigate(target)} aria-current={page === target ? "page" : undefined}><span className="ec-mobile-nav-icon" aria-hidden="true">{symbol}</span><span>{label}</span>{target === "messages" && unread > 0 && <span className="ec-mobile-count">{unread}</span>}</button>)}
        <button ref={menuTriggerRef} type="button" aria-label={expanded ? "Weitere Navigation schließen" : "Weitere Navigation öffnen"} aria-expanded={expanded} aria-controls="ec-mobile-complete-menu" onClick={() => setExpanded((value) => !value)}><span className="ec-mobile-nav-icon" aria-hidden="true">{expanded ? "✕" : "☰"}</span><span>Mehr</span></button>
      </nav>
    </div>
  );
}
