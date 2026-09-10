import { supabase } from "./supabaseClient";

const requests = new WeakMap();
let timer = null;
let observer = null;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const fmt = (value) => value ? new Date(value).toLocaleString("de-AT") : "–";

function riskClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function renderRows(panel, rows) {
  const list = panel.querySelector(".ec-fake-list");
  if (!list) return;
  list.replaceChildren();

  if (!rows.length) {
    list.innerHTML = '<p class="ec-fake-empty">Keine Konten gefunden.</p>';
    return;
  }

  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = `ec-fake-card risk-${riskClass(Number(row.risk_score || 0))}`;
    const signals = Array.isArray(row.signals) ? row.signals : [];
    const stateLabel = row.review_state === "SAFE"
      ? "Manuell als unauffällig eingestuft"
      : row.review_state === "FAKE"
        ? "Als Fake gesperrt"
        : "Noch nicht geprüft";

    card.innerHTML = `
      <div class="ec-fake-top">
        <div>
          <strong>${esc(row.nickname || "Ohne Nickname")}</strong>
          <small>${esc([row.first_name, row.last_name].filter(Boolean).join(" ") || "Name nicht angegeben")}</small>
        </div>
        <span class="ec-fake-score">Prüfpriorität ${Number(row.risk_score || 0)}/100</span>
      </div>
      <div class="ec-fake-meta">
        <span>Konto: ${esc(row.account_status || "–")}</span>
        <span>Erstellt: ${fmt(row.created_at)}</span>
        <span>Letzter Login: ${fmt(row.last_sign_in_at)}</span>
        <span>${row.email_confirmed ? "✓ E-Mail bestätigt" : "⚠ E-Mail offen"}</span>
        <span>${row.is_verified ? "✓ Profil verifiziert" : "Profil nicht verifiziert"}</span>
      </div>
      <ul class="ec-fake-signals">${signals.length ? signals.map((signal) => `<li>${esc(signal)}</li>`).join("") : "<li>Keine starken Auffälligkeiten erkannt.</li>"}</ul>
      <div class="ec-fake-stats">
        <span>${Number(row.open_reports || 0)} unabhängige Meldungen/30 Tage</span>
        <span>${Number(row.friend_requests_24h || 0)} Freundschaftsanfragen/24h</span>
        <span>${Number(row.messages_24h || 0)} Nachrichten/24h</span>
        <span>${Number(row.forum_posts || 0)} Forumsbeiträge</span>
      </div>
      <div class="ec-fake-review"><b>${esc(stateLabel)}</b>${row.review_note ? `<small>${esc(row.review_note)}</small>` : ""}</div>
      <div class="ec-fake-actions"></div>
    `;

    const actions = card.querySelector(".ec-fake-actions");

    const profileButton = document.createElement("button");
    profileButton.type = "button";
    profileButton.className = "secondary-button";
    profileButton.textContent = "Profil öffnen";
    profileButton.onclick = () => window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: row.user_id } }));
    actions.append(profileButton);

    const safeButton = document.createElement("button");
    safeButton.type = "button";
    safeButton.className = "secondary-button";
    safeButton.textContent = "Als unauffällig markieren";
    safeButton.onclick = async () => {
      const note = prompt("Optionaler Prüfvermerk:", row.review_note || "Profil manuell geprüft.");
      if (note === null) return;
      const { error } = await supabase.rpc("head_admin_set_fake_account_review", {
        p_target_user: row.user_id,
        p_state: "SAFE",
        p_note: note
      });
      if (error) return alert(error.message);
      await load(panel);
    };
    actions.append(safeButton);

    if (String(row.account_status || "").toUpperCase() === "SUSPENDED") {
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "secondary-button";
      restoreButton.textContent = "Konto entsperren";
      restoreButton.onclick = async () => {
        const note = prompt("Grund für die Entsperrung:", "Nachprüfung abgeschlossen.");
        if (note === null) return;
        const { error } = await supabase.rpc("head_admin_restore_fake_account", {
          p_target_user: row.user_id,
          p_note: note
        });
        if (error) return alert(error.message);
        await load(panel);
      };
      actions.append(restoreButton);
    } else {
      const suspendButton = document.createElement("button");
      suspendButton.type = "button";
      suspendButton.className = "danger-button";
      suspendButton.textContent = "Als Fake sperren";
      suspendButton.onclick = async () => {
        if (!confirm(`Konto „${row.nickname || "ohne Nickname"}“ wirklich als Fake sperren?`)) return;
        const note = prompt("Begründung für die Sperre:", "Verdacht auf Fake-Account nach manueller Prüfung.");
        if (note === null || !note.trim()) return;
        const { error } = await supabase.rpc("head_admin_set_fake_account_review", {
          p_target_user: row.user_id,
          p_state: "FAKE",
          p_note: note.trim()
        });
        if (error) return alert(error.message);
        await load(panel);
      };
      actions.append(suspendButton);
    }

    list.append(card);
  });
}

async function load(panel) {
  if (!panel?.isConnected) return;
  const requestId = (requests.get(panel) || 0) + 1;
  requests.set(panel, requestId);

  const list = panel.querySelector(".ec-fake-list");
  const summary = panel.querySelector(".ec-fake-summary");
  if (!list) return;
  list.textContent = "Konten werden geprüft …";
  if (summary) summary.textContent = "";

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!panel.isConnected || requests.get(panel) !== requestId) return;
    if (authError || !user) {
      list.textContent = "Deine Sitzung konnte nicht bestätigt werden. Bitte Seite neu laden.";
      return;
    }

    const { data, error } = await supabase.rpc("head_admin_fake_account_candidates", {
      p_search: panel.querySelector(".ec-fake-search")?.value || "",
      p_limit: 250
    });

    if (!panel.isConnected || requests.get(panel) !== requestId) return;
    if (error) {
      list.innerHTML = `<p class="ec-fake-empty"><strong>Fake-Erkennung konnte nicht geladen werden.</strong><br>${esc(error.message)}</p>`;
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const filter = panel.querySelector(".ec-fake-filter")?.value || "priority";
    const visible = rows.filter((row) => {
      if (filter === "all") return true;
      if (filter === "unreviewed") return String(row.review_state || "REVIEW") === "REVIEW";
      return Number(row.risk_score || 0) >= 40;
    });

    if (summary) {
      summary.textContent = `${rows.filter((row) => Number(row.risk_score || 0) >= 40).length} mit erhöhter Prüfpriorität · ${visible.length} angezeigt${rows.length === 250 ? " · max. 250 Konten, Suche eingrenzen" : ""}`;
    }
    renderRows(panel, visible);
  } catch (error) {
    if (panel.isConnected && requests.get(panel) === requestId) {
      list.innerHTML = `<p class="ec-fake-empty"><strong>Technischer Fehler beim Laden.</strong><br>${esc(error?.message || "Unbekannter Fehler")}</p>`;
    }
  }
}

function buildPanel() {
  const panel = document.createElement("section");
  panel.className = "panel ec-fake-admin";
  panel.innerHTML = `
    <div class="ec-fake-body">
      <div class="ec-fake-intro">
        <strong>Fake-Account-Prüfung</strong>
        <small>Nur Head Admin · Risikosignale & manuelle Entscheidung</small>
      </div>
      <p class="ec-fake-note">Die Prüfpriorität ist kein Beweis für ein Fake-Konto. Auffällige Kontaktmuster und Meldungen helfen bei der manuellen Prüfung. Es gibt keine automatische Sperre.</p>
      <div class="ec-fake-toolbar">
        <input class="ec-fake-search" type="search" aria-label="Nickname oder Name suchen" placeholder="Nickname oder Name suchen">
        <select class="ec-fake-filter" aria-label="Prüffilter">
          <option value="priority">Erhöhte Priorität (ab 40)</option>
          <option value="unreviewed">Noch nicht geprüft</option>
          <option value="all">Alle Konten</option>
        </select>
        <button type="button" class="primary-button ec-fake-refresh">Neu prüfen</button>
      </div>
      <p class="ec-fake-summary" role="status"></p>
      <div class="ec-fake-list" aria-live="polite"></div>
    </div>`;

  panel.querySelector(".ec-fake-refresh").onclick = () => void load(panel);
  panel.querySelector(".ec-fake-filter").onchange = () => void load(panel);
  panel.querySelector(".ec-fake-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void load(panel);
  });
  return panel;
}

function mount() {
  const roots = [...document.querySelectorAll(".fake-account-page")];
  if (!roots.length) return;

  roots.forEach((root) => {
    let panel = root.querySelector(":scope > .ec-fake-admin");
    if (!panel) {
      panel = buildPanel();
      root.appendChild(panel);
      void load(panel);
    }
  });
}

function scheduleMount() {
  clearTimeout(timer);
  timer = setTimeout(mount, 40);
}

function boot() {
  mount();
  observer?.disconnect();
  observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  window.addEventListener("ec:navigate", scheduleMount);
  window.addEventListener("focus", scheduleMount);
  setInterval(() => {
    if (!document.hidden) mount();
  }, 1000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
