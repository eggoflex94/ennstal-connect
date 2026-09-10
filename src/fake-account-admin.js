import { supabase } from "./supabaseClient";

let mounted = false;
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt = (value) => value ? new Date(value).toLocaleString("de-AT") : "–";

function riskClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function renderRows(panel, rows) {
  const list = panel.querySelector(".ec-fake-list");
  list.replaceChildren();
  if (!rows.length) {
    list.innerHTML = '<p class="ec-fake-empty">Keine Konten gefunden.</p>';
    return;
  }

  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = `ec-fake-card risk-${riskClass(Number(row.risk_score || 0))}`;
    const signals = (row.signals || []).map((signal) => `<li>${esc(signal)}</li>`).join("");
    const stateLabel = row.review_state === "SAFE" ? "Als echt geprüft" : row.review_state === "FAKE" ? "Als Fake gesperrt" : "Prüfung offen";
    card.innerHTML = `
      <div class="ec-fake-top">
        <div>
          <strong>${esc(row.nickname || "Ohne Nickname")}</strong>
          <small>${esc([row.first_name, row.last_name].filter(Boolean).join(" ") || "Name nicht angegeben")}</small>
        </div>
        <span class="ec-fake-score">Risiko ${Number(row.risk_score || 0)}/100</span>
      </div>
      <div class="ec-fake-meta">
        <span>Konto: ${esc(row.account_status || "–")}</span>
        <span>Erstellt: ${fmt(row.created_at)}</span>
        <span>Letzter Login: ${fmt(row.last_sign_in_at)}</span>
        <span>${row.email_confirmed ? "✓ E-Mail bestätigt" : "⚠ E-Mail offen"}</span>
        <span>${row.is_verified ? "✓ Profil verifiziert" : "Profil nicht verifiziert"}</span>
      </div>
      <ul class="ec-fake-signals">${signals || "<li>Keine starken Auffälligkeiten erkannt.</li>"}</ul>
      <div class="ec-fake-stats">
        <span>${Number(row.open_reports || 0)} offene Meldungen</span>
        <span>${Number(row.friend_requests_24h || 0)} Freundschaftsanfragen/24h</span>
        <span>${Number(row.messages_24h || 0)} Nachrichten/24h</span>
        <span>${Number(row.forum_posts || 0)} Forumsbeiträge</span>
      </div>
      <div class="ec-fake-review"><b>${esc(stateLabel)}</b>${row.review_note ? `<small>${esc(row.review_note)}</small>` : ""}</div>
      <div class="ec-fake-actions"></div>
    `;

    const actions = card.querySelector(".ec-fake-actions");
    const openProfile = document.createElement("button");
    openProfile.type = "button";
    openProfile.className = "secondary-button";
    openProfile.textContent = "Profil öffnen";
    openProfile.onclick = () => window.dispatchEvent(new CustomEvent("ec:open-profile", { detail: { profileId: row.user_id } }));
    actions.append(openProfile);

    const safe = document.createElement("button");
    safe.type = "button";
    safe.className = "secondary-button";
    safe.textContent = "Als echt markieren";
    safe.onclick = async () => {
      const note = prompt("Optionaler Prüfvermerk:", row.review_note || "Profil manuell geprüft.");
      if (note === null) return;
      const { error } = await supabase.rpc("head_admin_set_fake_account_review", { p_target_user: row.user_id, p_state: "SAFE", p_note: note });
      if (error) return alert(error.message);
      await load(panel);
    };
    actions.append(safe);

    if (row.account_status === "SUSPENDED") {
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "secondary-button";
      restore.textContent = "Konto entsperren";
      restore.onclick = async () => {
        const note = prompt("Grund für die Entsperrung:", "Nachprüfung abgeschlossen.");
        if (note === null) return;
        const { error } = await supabase.rpc("head_admin_restore_fake_account", { p_target_user: row.user_id, p_note: note });
        if (error) return alert(error.message);
        await load(panel);
      };
      actions.append(restore);
    } else {
      const suspend = document.createElement("button");
      suspend.type = "button";
      suspend.className = "danger-button";
      suspend.textContent = "Als Fake sperren";
      suspend.onclick = async () => {
        if (!confirm(`Konto „${row.nickname || "ohne Nickname"}“ wirklich als Fake sperren? Das Konto wird deaktiviert, aber nicht endgültig gelöscht.`)) return;
        const note = prompt("Begründung für die Sperre:", "Verdacht auf Fake-Account nach manueller Prüfung.");
        if (note === null || !note.trim()) return;
        const { error } = await supabase.rpc("head_admin_set_fake_account_review", { p_target_user: row.user_id, p_state: "FAKE", p_note: note });
        if (error) return alert(error.message);
        await load(panel);
      };
      actions.append(suspend);
    }

    list.append(card);
  });
}

async function load(panel) {
  const search = panel.querySelector(".ec-fake-search")?.value || "";
  const list = panel.querySelector(".ec-fake-list");
  list.textContent = "Konten werden geprüft …";
  const { data, error } = await supabase.rpc("head_admin_fake_account_candidates", { p_search: search, p_limit: 150 });
  if (error) {
    list.textContent = error.message;
    return;
  }
  renderRows(panel, data || []);
}

function render(root) {
  const panel = document.createElement("details");
  panel.className = "panel ec-fake-admin";
  panel.innerHTML = `
    <summary><span>🕵</span><span><strong>Fake-Account-Prüfung</strong><small>Nur Head Admin · Risikosignale & manuelle Entscheidung</small></span><span>⌄</span></summary>
    <div class="ec-fake-body">
      <p class="ec-fake-note"><strong>Wichtig:</strong> Der Score ist nur eine Prüfhilfe. Ein Konto wird niemals automatisch gelöscht. Gezeigt werden nur Community-Signale wie Kontenalter, E-Mail-Bestätigung, offene Meldungen und ungewöhnlich hohe Aktivität.</p>
      <div class="ec-fake-toolbar"><input class="ec-fake-search" type="search" placeholder="Nickname oder Name suchen"><button type="button" class="primary-button ec-fake-refresh">Prüfen</button></div>
      <div class="ec-fake-list"></div>
    </div>`;
  panel.addEventListener("toggle", () => { if (panel.open) void load(panel); });
  panel.querySelector(".ec-fake-refresh").onclick = () => void load(panel);
  panel.querySelector(".ec-fake-search").addEventListener("keydown", (event) => { if (event.key === "Enter") void load(panel); });
  const deletion = root.querySelector(".ec-deletion-admin");
  (deletion || root.lastElementChild)?.after?.(panel) || root.append(panel);
  mounted = true;
}

async function mount() {
  if (mounted) return;
  const root = document.querySelector(".admin-page");
  if (!root) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from("profiles").select("role,account_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "HEAD_ADMIN" || profile?.account_status !== "ACTIVE") return;
  render(root);
}

let timer;
const observer = new MutationObserver(() => {
  if (mounted) return;
  clearTimeout(timer);
  timer = setTimeout(() => void mount(), 200);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
void mount();
