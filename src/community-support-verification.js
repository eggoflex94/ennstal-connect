import { supabase } from "./supabaseClient";

const SUPPORT_EMAIL = "ennstal.connect@gmx.at";
let currentUser = null;
let currentProfile = null;
let supportOpen = false;
let syncTimer = null;

const text = (value) => String(value || "").trim();
const normalizeRole = (value) => text(value).toUpperCase();
const isAdmin = (profile) => ["ADMIN", "HEAD_ADMIN"].includes(normalizeRole(profile?.role));
const isHeadAdmin = (profile) => normalizeRole(profile?.role) === "HEAD_ADMIN";
const displayName = (profile) => text(profile?.nickname) || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Community-Team";

function supportAreas(profile) {
  const role = normalizeRole(profile?.role);
  if (role === "HEAD_ADMIN") return ["Datenschutz", "Technischer Support", "Sicherheit", "Community-Verwaltung"];
  if (role === "ADMIN") {
    const custom = Array.isArray(profile?.admin_responsibilities) ? profile.admin_responsibilities.filter(Boolean) : [];
    return custom.length ? custom : ["Community-Support", "Mitglieder & Community", "Meldungen"];
  }
  const result = [];
  if (profile?.forum_moderator) result.push("Forum-Moderation");
  if (profile?.group_moderator) result.push("Gruppen-Moderation");
  return result;
}

function toast(message, error = false) {
  let host = document.querySelector(".ec-support-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "ec-support-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  const node = document.createElement("div");
  node.className = `ec-support-toast${error ? " error" : ""}`;
  node.textContent = message;
  host.append(node);
  setTimeout(() => node.remove(), 5000);
}

async function loadIdentity() {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  currentUser = data?.user || null;
  if (!currentUser?.id) {
    currentProfile = null;
    return;
  }
  const result = await supabase.from("profiles").select("id,nickname,first_name,last_name,role,is_verified,region_id,admin_responsibilities,forum_moderator,group_moderator").eq("id", currentUser.id).maybeSingle();
  if (!result.error) currentProfile = result.data || null;
}

function closeSupport() {
  document.querySelector(".ec-support-overlay")?.remove();
  document.body.classList.remove("ec-support-open");
  supportOpen = false;
}

function createButton(label, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

async function requestOwnVerification(button) {
  if (!currentUser?.id) return;
  if (currentProfile?.is_verified) return toast("Dein Profil ist bereits verifiziert.");
  const note = window.prompt("Optionaler Hinweis für deine Verifizierungsanfrage:", "Ich möchte mein Profil verifizieren lassen.");
  if (note === null) return;
  button.disabled = true;
  try {
    const { error } = await supabase.rpc("request_profile_verification", { p_note: text(note) });
    if (error) throw error;
    toast("Deine Verifizierungsanfrage wurde gesendet.");
  } catch (error) {
    toast(error?.message || "Verifizierungsanfrage konnte nicht gesendet werden.", true);
  } finally {
    button.disabled = false;
  }
}

async function loadSupportContacts() {
  const { data, error } = await supabase.rpc("community_moderation_contacts");
  if (error) throw error;
  return (data || []).filter((profile) => {
    const role = normalizeRole(profile?.role);
    return role === "HEAD_ADMIN" || role === "ADMIN" || (role === "SUPPORTER" && (profile?.forum_moderator || profile?.group_moderator));
  });
}

function renderContact(profile) {
  const card = document.createElement("article");
  card.className = "ec-support-person";
  const top = document.createElement("button");
  top.type = "button";
  top.className = "ec-support-person-profile";
  top.innerHTML = `<strong></strong><small></small>`;
  top.querySelector("strong").textContent = displayName(profile);
  top.querySelector("small").textContent = normalizeRole(profile.role) === "HEAD_ADMIN" ? "Global Administration" : normalizeRole(profile.role) === "ADMIN" ? "Regionale Administration" : "Support";
  top.onclick = () => {
    closeSupport();
    window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: profile.user_id || profile.id, nickname: displayName(profile) } }));
  };
  card.append(top);
  const areas = supportAreas(profile);
  if (areas.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Supportbereiche";
    const list = document.createElement("ul");
    areas.forEach((area) => {
      const item = document.createElement("li");
      item.textContent = area;
      list.append(item);
    });
    details.append(summary, list);
    card.append(details);
  }
  return card;
}

async function openSupport() {
  if (supportOpen) return closeSupport();
  supportOpen = true;
  await loadIdentity();
  const overlay = document.createElement("div");
  overlay.className = "ec-support-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Support");
  const card = document.createElement("section");
  card.className = "ec-support-dialog";
  const head = document.createElement("header");
  head.innerHTML = `<div><span>ENNSTAL CONNECT</span><h2>Support</h2><p>Hilfe, Ansprechpartner und Profil-Verifizierung an einem Ort.</p></div>`;
  const close = createButton("×", "ec-support-close");
  close.setAttribute("aria-label", "Schließen");
  close.onclick = closeSupport;
  head.append(close);
  card.append(head);

  const actions = document.createElement("div");
  actions.className = "ec-support-actions";
  const mail = document.createElement("a");
  mail.className = "primary-button ec-support-link";
  mail.href = `mailto:${SUPPORT_EMAIL}`;
  mail.textContent = "✉ Support per E-Mail";
  actions.append(mail);
  if (currentUser) {
    const verify = createButton(currentProfile?.is_verified ? "✓ Profil ist verifiziert" : "✓ Profil verifizieren");
    verify.disabled = Boolean(currentProfile?.is_verified);
    verify.onclick = () => requestOwnVerification(verify);
    actions.append(verify);
  }
  card.append(actions);

  const privacy = document.createElement("aside");
  privacy.className = "ec-support-privacy";
  privacy.innerHTML = `<strong>Datenschutz bei der Verifizierung</strong><p>Bitte keine vollständigen Ausweiskopien oder sensiblen Dokumente im Chat senden. Nutze möglichst persönliche oder Video-Verifizierung bzw. nur einen auf das notwendige Minimum reduzierten Nachweis. Dauerhaft gespeichert werden soll nur das Prüfergebnis mit Zeitpunkt und Prüfer, nicht das Nachweisdokument.</p>`;
  card.append(privacy);

  const contactsTitle = document.createElement("h3");
  contactsTitle.textContent = "Ansprechpartner";
  card.append(contactsTitle);
  const contacts = document.createElement("div");
  contacts.className = "ec-support-people";
  contacts.textContent = "Wird geladen …";
  card.append(contacts);

  overlay.append(card);
  document.body.append(overlay);
  document.body.classList.add("ec-support-open");
  overlay.onclick = (event) => { if (event.target === overlay) closeSupport(); };
  try {
    const people = await loadSupportContacts();
    contacts.replaceChildren(...people.map(renderContact));
    if (!people.length) contacts.textContent = "Derzeit sind keine Support-Ansprechpartner hinterlegt.";
  } catch (error) {
    contacts.textContent = "Support-Ansprechpartner konnten gerade nicht geladen werden.";
    console.warn(error);
  }
  close.focus();
}

function findNav() {
  return document.querySelector(".ec-regional-shell .regional-topbar, .ec-regional-shell header, .modern-nav, nav");
}

function ensureSupportNav() {
  const nav = findNav();
  if (!nav || nav.querySelector(".ec-support-nav-button")) return;
  const button = createButton("Support", "ec-support-nav-button");
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openSupport();
  };
  const notification = nav.querySelector(".ec-notification-bell-wrap, .ec-notification-bell");
  if (notification?.parentElement === nav) nav.insertBefore(button, notification);
  else nav.append(button);
}

function removeResponsibilityLabels() {
  document.querySelectorAll(".admin-responsibilities").forEach((node) => node.remove());
  document.querySelectorAll("h1,h2,h3,h4,summary,.eyebrow,span,strong,p").forEach((node) => {
    if (node.closest(".ec-support-overlay")) return;
    const value = text(node.textContent);
    if (!value || node.children.length) return;
    if (/^Zuständigkeiten$/i.test(value)) node.remove();
    else if (/^Zuständig für:/i.test(value)) node.remove();
  });
}

function dedupeMessageOverview() {
  const overview = document.querySelector(".message-overview");
  if (!overview) return;
  const seen = new Set();
  [...overview.querySelectorAll(".message-preview")].forEach((row) => {
    const name = text(row.querySelector("strong")?.textContent).toLocaleLowerCase("de-AT");
    if (!name) return;
    if (seen.has(name)) row.remove();
    else seen.add(name);
  });
}

function improveProfileLinks() {
  document.querySelectorAll(".member-profile-page a[href], .profile-social-actions a[href], .profile-visible-details a[href]").forEach((link) => {
    link.style.pointerEvents = "auto";
    link.removeAttribute("aria-disabled");
    if (/^https?:/i.test(link.href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function syncUi() {
  ensureSupportNav();
  removeResponsibilityLabels();
  dedupeMessageOverview();
  improveProfileLinks();
}

function boot() {
  void loadIdentity().finally(syncUi);
  const observer = new MutationObserver(() => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncUi, 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("ec:region-change", syncUi);
  window.addEventListener("ec:network-restored", () => void loadIdentity());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSupport(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
