import { supabase } from "./supabaseClient";

const SUPPORT_EMAIL = "ennstal.connect@gmx.at";
const TEAM_ROLES = new Set(["HEAD_ADMIN", "ADMIN", "SUPPORTER"]);
const ROLE_ORDER = { HEAD_ADMIN: 0, ADMIN: 1, SUPPORTER: 2 };
const PUBLIC_RESPONSIBILITIES = {
  HEAD_ADMIN: ["Datenschutz", "Technischer Support", "Sicherheit", "Community-Verwaltung"],
  ADMIN: ["Community-Support", "Hilfe bei Fragen & Problemen", "Gruppen & Community-Bereiche", "Marktplatz-Support", "Neuigkeiten & Informationen", "Unterstützung bei Meldungen"],
  SUPPORTER: ["Community-Support", "Hilfe bei Fragen & Problemen", "Unterstützung für Mitglieder"]
};
let refreshRunning = false;
let lastSignature = "";
let realtimeStarted = false;
let pollTimer = null;

function normalizeRole(value) { return String(value || "").trim().toUpperCase(); }
function roleLabel(role) { if (role === "HEAD_ADMIN") return "Betreiber"; if (role === "ADMIN") return "Admin"; if (role === "SUPPORTER") return "Supporter"; return "Team"; }
function displayName(profile) { return profile.nickname || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Community-Team"; }
function responsibilities(profile) { return PUBLIC_RESPONSIBILITIES[normalizeRole(profile.role)] || []; }

function findHostCard() {
  const heading = [...document.querySelectorAll("h1,h2,h3,h4")].find((node) => {
    const text = String(node.textContent || "").trim();
    return /^Administration(?:\s*&\s*Support)?$/i.test(text) || /^Ansprechpartner$/i.test(text);
  });
  if (!heading) return null;
  return heading.closest("section,article,.card,.dashboard-card,.home-card,.panel") || heading.parentElement;
}

function hideLegacyContacts(host, heading, panel) {
  [...host.children].forEach((child) => {
    if (child === heading || child === panel || child.classList?.contains("eyebrow")) return;
    const text = String(child.textContent || "").trim();
    if (/Marco|Roland|Zuständig\s+für|Nachrichten verwalten|Profilbesuche|Community-Verwaltung|Technischen Support|Technischer Support/i.test(text)) {
      child.style.display = "none";
      child.dataset.ecLegacyContact = "true";
    }
  });
}

function makeAvatar(profile) {
  if (profile.avatar_url) {
    const image = document.createElement("img"); image.className = "ec-team-avatar"; image.src = profile.avatar_url; image.alt = ""; image.loading = "lazy"; return image;
  }
  const fallback = document.createElement("div"); fallback.className = "ec-team-avatar ec-team-avatar-fallback"; fallback.textContent = displayName(profile).slice(0, 1).toUpperCase(); return fallback;
}

function makePerson(profile) {
  const role = normalizeRole(profile.role);
  const card = document.createElement("article"); card.className = `ec-team-person ec-role-${role.toLowerCase()}`;
  const top = document.createElement("div"); top.className = "ec-team-person-top"; top.appendChild(makeAvatar(profile));
  const identity = document.createElement("div"); identity.className = "ec-team-identity";
  const name = document.createElement("strong"); name.textContent = displayName(profile);
  const badge = document.createElement("span"); badge.className = "ec-team-role"; badge.textContent = roleLabel(role);
  identity.append(name, badge); top.appendChild(identity); card.appendChild(top);
  const items = responsibilities(profile);
  if (items.length) {
    const details = document.createElement("details"); details.className = "ec-team-details";
    const summary = document.createElement("summary"); summary.textContent = "Zuständigkeiten";
    const list = document.createElement("ul");
    items.forEach((item) => { const li = document.createElement("li"); li.textContent = item; list.appendChild(li); });
    details.append(summary, list); card.appendChild(details);
  }
  return card;
}

function renderTeam(profiles) {
  const host = findHostCard(); if (!host) return;
  const heading = [...host.querySelectorAll("h1,h2,h3,h4")].find((node) => /Administration|Ansprechpartner/i.test(node.textContent || ""));
  if (heading) heading.textContent = "Administration & Support";
  let panel = host.querySelector(".ec-team-panel");
  if (!panel) { panel = document.createElement("section"); panel.className = "ec-team-panel"; const oldPanel = host.querySelector(".ec-support-panel"); if (oldPanel) oldPanel.replaceWith(panel); else heading?.insertAdjacentElement("afterend", panel); }
  hideLegacyContacts(host, heading, panel); panel.replaceChildren();
  const intro = document.createElement("div"); intro.className = "ec-team-intro";
  const introText = document.createElement("div"); const title = document.createElement("strong"); title.textContent = "Support & Ansprechpartner";
  const copy = document.createElement("p"); copy.textContent = "Für sämtliche Support-Anfragen kannst du den Betreiber per Privatnachricht kontaktieren oder dich an die unten angeführten Admins und Supporter wenden."; introText.append(title, copy);
  const email = document.createElement("a"); email.className = "ec-team-email"; email.href = `mailto:${SUPPORT_EMAIL}`; email.title = SUPPORT_EMAIL; email.setAttribute("aria-label", `E-Mail an ${SUPPORT_EMAIL} senden`); email.textContent = "✉ E-Mail senden";
  intro.append(introText, email); panel.appendChild(intro);
  if (!profiles.length) { const empty = document.createElement("p"); empty.className = "ec-team-empty"; empty.textContent = "Derzeit sind keine Ansprechpartner eingetragen."; panel.appendChild(empty); return; }
  [["HEAD_ADMIN","Betreiber"],["ADMIN","Admins"],["SUPPORTER","Supporter"]].forEach(([role,label]) => {
    const members = profiles.filter((profile) => normalizeRole(profile.role) === role); if (!members.length) return;
    const group = document.createElement("div"); group.className = "ec-team-group";
    const groupTitle = document.createElement("div"); groupTitle.className = "ec-team-group-title"; groupTitle.textContent = `${label} · ${members.length}`;
    const grid = document.createElement("div"); grid.className = "ec-team-grid"; members.forEach((profile) => grid.appendChild(makePerson(profile))); group.append(groupTitle, grid); panel.appendChild(group);
  });
}

function signature(profiles) { return profiles.map((profile) => [profile.id,normalizeRole(profile.role),profile.nickname,profile.first_name,profile.last_name,profile.avatar_url].join("|")).join("::"); }

async function refreshTeam() {
  if (!supabase || refreshRunning || !findHostCard()) return; refreshRunning = true;
  try {
    const { data, error } = await supabase.from("profiles").select("id,nickname,first_name,last_name,avatar_url,role").in("role", ["HEAD_ADMIN","ADMIN","SUPPORTER"]); if (error) throw error;
    const profiles = (data || []).filter((profile) => TEAM_ROLES.has(normalizeRole(profile.role))).sort((a,b) => { const roleDiff = (ROLE_ORDER[normalizeRole(a.role)] ?? 9) - (ROLE_ORDER[normalizeRole(b.role)] ?? 9); return roleDiff || displayName(a).localeCompare(displayName(b), "de"); });
    const nextSignature = signature(profiles);
    if (nextSignature !== lastSignature || !document.querySelector(".ec-team-panel")) { lastSignature = nextSignature; renderTeam(profiles); }
    else { const host = findHostCard(); const panel = host?.querySelector(".ec-team-panel"); const heading = host ? [...host.querySelectorAll("h1,h2,h3,h4")].find((node) => /Administration|Ansprechpartner/i.test(node.textContent || "")) : null; if (host && panel) hideLegacyContacts(host, heading, panel); }
  } catch (error) { console.error("Administration & Support konnte nicht synchronisiert werden:", error); } finally { refreshRunning = false; }
}

function startRealtime() { if (!supabase || realtimeStarted) return; realtimeStarted = true; supabase.channel("ec-team-role-sync-v3").on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => { lastSignature = ""; refreshTeam(); }).subscribe(); }
function startFallbackSync() { if (pollTimer) return; pollTimer = window.setInterval(() => { if (!document.hidden) refreshTeam(); }, 15000); window.addEventListener("focus", refreshTeam); document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshTeam(); }); }
function boot() { refreshTeam(); startRealtime(); startFallbackSync(); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
const observer = new MutationObserver(() => { const host = findHostCard(); if (!host) return; const panel = host.querySelector(".ec-team-panel"); const heading = [...host.querySelectorAll("h1,h2,h3,h4")].find((node) => /Administration|Ansprechpartner/i.test(node.textContent || "")); if (panel) hideLegacyContacts(host, heading, panel); else refreshTeam(); });
observer.observe(document.documentElement, { childList: true, subtree: true });
