import { supabase } from "./supabaseClient";
import "./admin-error-center.css";

let accessCache = { userId: null, allowed: false, checkedAt: 0 };
let activeStatus = "OPEN";
let refreshTimer = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
const fmt = (value) => value ? new Date(value).toLocaleString("de-AT") : "–";

async function canUse() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      accessCache = { userId: null, allowed: false, checkedAt: 0 };
      return false;
    }
    if (accessCache.userId === user.id && Date.now() - accessCache.checkedAt < 15_000) {
      return accessCache.allowed;
    }
    const { data } = await supabase.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
    const allowed = data?.account_status === "ACTIVE" && String(data?.role || "").toUpperCase() === "HEAD_ADMIN";
    accessCache = { userId: user.id, allowed, checkedAt: Date.now() };
    return allowed;
  } catch {
    return false;
  }
}

async function summary() {
  const { data, error } = await supabase.rpc("head_admin_error_summary");
  if (error) throw error;
  return data || {};
}

async function feed(status = activeStatus) {
  const { data, error } = await supabase.rpc("head_admin_error_feed", { p_status: status, p_limit: 150 });
  if (error) throw error;
  return data || [];
}

function renderRow(row) {
  const article = document.createElement("article");
  article.className = "ec-error-row";
  article.dataset.severity = row.severity || "ERROR";
  article.innerHTML = `
    <div class="ec-error-row-head">
      <div><small>${esc(row.error_type)} · ${esc(row.severity)}</small><h3>${esc(row.title)}</h3></div>
      <small>${fmt(row.last_seen_at)}</small>
    </div>
    <p>${esc(row.message)}</p>
    <div class="ec-error-meta">
      <span>× ${Number(row.occurrence_count) || 1}</span>
      <span>${esc(row.path || "/")}</span>
      <span>Zuletzt: ${esc(row.last_user_nickname || "Unbekannt")}</span>
      <span>Status: ${esc(row.status)}</span>
    </div>
    <details>
      <summary>Technische Details</summary>
      <pre>${esc([row.source && `Quelle: ${row.source}`, row.stack, row.metadata && JSON.stringify(row.metadata, null, 2)].filter(Boolean).join("\n\n"))}</pre>
    </details>
    <div class="ec-error-actions">
      ${row.status !== "RESOLVED" ? '<button type="button" data-status="RESOLVED">✓ Gelöst</button>' : '<button type="button" data-status="OPEN">↺ Wieder öffnen</button>'}
      ${row.status !== "IGNORED" ? '<button type="button" data-status="IGNORED">Ignorieren</button>' : ''}
    </div>`;
  article.querySelectorAll("[data-status]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      const { error } = await supabase.rpc("head_admin_set_error_status", { p_id: row.id, p_status: button.dataset.status });
      if (error) {
        button.disabled = false;
        window.alert(error.message);
        return;
      }
      await refreshOpenCenter();
      void updateAdminTile();
    };
  });
  return article;
}

async function refreshOpenCenter() {
  const overlay = document.querySelector(".ec-error-center-overlay");
  if (!overlay) return;
  const sumHost = overlay.querySelector(".ec-error-summary");
  const list = overlay.querySelector(".ec-error-list");
  list.innerHTML = '<p class="ec-error-empty">Fehler werden geladen …</p>';
  try {
    const [s, rows] = await Promise.all([summary(), feed()]);
    sumHost.innerHTML = `
      <article><small>Offen</small><strong>${Number(s.open_total) || 0}</strong></article>
      <article><small>Kritisch</small><strong>${Number(s.critical_open) || 0}</strong></article>
      <article><small>Fehler</small><strong>${Number(s.error_open) || 0}</strong></article>
      <article><small>Warnungen</small><strong>${Number(s.warn_open) || 0}</strong></article>`;
    list.replaceChildren();
    if (!rows.length) list.innerHTML = '<div class="ec-error-empty"><strong>Keine Einträge</strong><p>Für diesen Filter sind aktuell keine Fehler vorhanden.</p></div>';
    else rows.forEach((row) => list.appendChild(renderRow(row)));
  } catch (error) {
    list.innerHTML = `<p class="ec-error-empty">Fehlerzentrale konnte nicht geladen werden: ${esc(error?.message || error)}</p>`;
  }
}

async function openErrorCenter() {
  if (!(await canUse())) return;
  document.querySelector(".ec-error-center-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "ec-error-center-overlay";
  overlay.innerHTML = `
    <section class="ec-error-center" role="dialog" aria-modal="true" aria-label="Head Admin Fehlerzentrale">
      <header><div><span class="eyebrow">HEAD ADMIN · SYSTEM</span><h2>Fehlerzentrale</h2><p>Automatisch erkannte Browser-, Server-, Netzwerk- und Layoutfehler.</p></div><button class="ec-error-center-close" type="button" aria-label="Schließen">×</button></header>
      <div class="ec-error-summary"></div>
      <div class="ec-error-toolbar">
        <button type="button" data-filter="OPEN" class="active">Offen</button>
        <button type="button" data-filter="RESOLVED">Gelöst</button>
        <button type="button" data-filter="IGNORED">Ignoriert</button>
        <button type="button" data-filter="ALL">Alle</button>
        <button type="button" data-refresh>Neu laden</button>
      </div>
      <div class="ec-error-list"></div>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".ec-error-center-close").onclick = () => overlay.remove();
  overlay.onclick = (event) => { if (event.target === overlay) overlay.remove(); };
  overlay.querySelectorAll("[data-filter]").forEach((button) => {
    button.onclick = async () => {
      activeStatus = button.dataset.filter;
      overlay.querySelectorAll("[data-filter]").forEach((x) => x.classList.toggle("active", x === button));
      await refreshOpenCenter();
    };
  });
  overlay.querySelector("[data-refresh]").onclick = () => void refreshOpenCenter();
  await refreshOpenCenter();
}

async function updateAdminTile() {
  if (!(await canUse())) return;
  const grid = document.querySelector(".ec-admin-hub-grid");
  if (!grid) return;

  let button = grid.querySelector("[data-error-center]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "ec-admin-hub-tile";
    button.dataset.errorCenter = "1";
    button.dataset.tone = "red";
    button.innerHTML = '<span class="ec-admin-hub-tile-icon" aria-hidden="true">⚠</span><span><strong>Fehlerzentrale</strong><small>Browser-, Server- und Layoutfehler prüfen</small></span>';
    button.onclick = (event) => { event.preventDefault(); void openErrorCenter(); };
    grid.appendChild(button);
  }

  try {
    const s = await summary();
    let badge = button.querySelector(".ec-error-count-badge");
    const count = Number(s.open_total) || 0;
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "ec-error-count-badge";
        button.appendChild(badge);
      }
      badge.textContent = count > 99 ? "99+" : String(count);
      button.setAttribute("aria-label", `Fehlerzentrale, ${count} offene Fehler`);
    } else {
      badge?.remove();
      button.setAttribute("aria-label", "Fehlerzentrale, keine offenen Fehler");
    }
  } catch {}
}

window.addEventListener("ec:open-system-errors", () => void openErrorCenter());
window.addEventListener("ec:navigate", () => setTimeout(() => void updateAdminTile(), 80));
window.addEventListener("focus", () => void updateAdminTile());
const observer = new MutationObserver(() => { if (document.querySelector(".ec-admin-hub-grid")) void updateAdminTile(); });
observer.observe(document.documentElement, { childList: true, subtree: true });

refreshTimer = window.setInterval(() => {
  if (document.visibilityState === "visible") void updateAdminTile();
}, 60_000);
window.addEventListener("pagehide", () => clearInterval(refreshTimer), { once: true });
void updateAdminTile();


supabase?.auth?.onAuthStateChange?.(() => {
  accessCache = { userId: null, allowed: false, checkedAt: 0 };
  setTimeout(() => void updateAdminTile(), 100);
});
