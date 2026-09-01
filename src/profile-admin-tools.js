import { supabase } from "./supabaseClient";

const ADMIN_ROLES = new Set(["ADMIN", "HEAD_ADMIN"]);
const HEAD = "HEAD_ADMIN";
const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

async function currentContext() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data: me } = await supabase.from("profiles").select("id,role").eq("id", session.user.id).maybeSingle();
  return me ? { user: session.user, me } : null;
}

async function resolveTarget(modal) {
  const title = modal.querySelector(".member-title-line h1, .modal-profile-header h1, h1");
  const shown = title?.textContent?.trim();
  if (!shown) return null;
  const { data } = await supabase.from("profiles").select("*");
  const list = data || [];
  return list.find((p) => (p.nickname || "").trim() === shown) || list.find((p) => `${p.first_name || ""} ${p.last_name || ""}`.trim() === shown) || null;
}

function addTools(modal, ctx, target) {
  if (!target || target.id === ctx.user.id || !ADMIN_ROLES.has(ctx.me.role)) return;
  if (modal.querySelector(".ec-profile-admin-tools")) return;

  const host = modal.querySelector(".modal-content") || modal;
  const box = document.createElement("section");
  box.className = "ec-profile-admin-tools";
  box.innerHTML = `
    <div class="ec-admin-title"><span>MODERATION</span><strong>🛡️ Admin-Werkzeuge</strong></div>
    <div class="ec-admin-actions">
      <button type="button" data-action="warn">⚠️ Verwarnung per Nachricht</button>
      <button type="button" data-action="edit">✎ Daten bearbeiten</button>
      <button type="button" data-action="role-admin">★ Admin</button>
      <button type="button" data-action="role-supporter">🟢 Supporter</button>
      <button type="button" data-action="role-member">↩ Rolle entfernen</button>
    </div>
    <form class="ec-admin-edit" hidden>
      <div class="ec-admin-grid">
        <label>Nickname<input name="nickname" value="${esc(target.nickname)}"></label>
        <label>Vorname<input name="first_name" value="${esc(target.first_name)}"></label>
        <label>Nachname<input name="last_name" value="${esc(target.last_name)}"></label>
        <label>Geburtsdatum<input type="date" name="birth_date" value="${esc(target.birth_date)}"></label>
        <label>Rolle<select name="role">
          <option value="MEMBER" ${target.role === "MEMBER" ? "selected" : ""}>Mitglied</option>
          <option value="SUPPORTER" ${target.role === "SUPPORTER" ? "selected" : ""}>Supporter</option>
          <option value="ADMIN" ${target.role === "ADMIN" ? "selected" : ""}>Community Admin</option>
        </select></label>
      </div>
      <button type="submit">💾 Änderungen speichern</button>
    </form>`;
  host.appendChild(box);

  const edit = box.querySelector(".ec-admin-edit");
  box.querySelector('[data-action="edit"]').hidden = ctx.me.role !== HEAD;
  box.querySelector('[data-action="role-admin"]').hidden = ctx.me.role !== HEAD;
  box.querySelector('[data-action="role-supporter"]').hidden = ctx.me.role !== HEAD;
  box.querySelector('[data-action="role-member"]').hidden = ctx.me.role !== HEAD || target.role === "MEMBER";

  box.querySelector('[data-action="warn"]').onclick = async () => {
    const text = window.prompt(`Verwarnung an ${target.nickname || target.first_name || "Mitglied"}:`, "Bitte beachte die Community-Regeln. Dies ist eine offizielle Verwarnung.");
    if (!text?.trim()) return;
    const { error } = await supabase.rpc("admin_warn_user", { target_user: target.id, warning_text: text.trim() });
    if (error) return alert(error.message);
    alert("Verwarnung wurde als Nachricht gesendet.");
  };

  if (ctx.me.role === HEAD) {
    box.querySelector('[data-action="edit"]').onclick = () => { edit.hidden = !edit.hidden; };
    edit.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const { error } = await supabase.rpc("admin_update_member", {
        p_user_id: target.id,
        p_nickname: String(f.get("nickname") || "").trim(),
        p_first_name: String(f.get("first_name") || "").trim(),
        p_last_name: String(f.get("last_name") || "").trim(),
        p_birth_date: f.get("birth_date") || null,
        p_gender: target.gender || null,
        p_role: String(f.get("role") || "MEMBER"),
        p_account_status: target.account_status || "ACTIVE"
      });
      if (error) return alert(error.message);
      alert("Mitgliedsdaten gespeichert.");
      window.location.reload();
    };
    const role = async (newRole) => {
      const { error } = await supabase.rpc("admin_set_role", { target_user: target.id, new_role: newRole });
      if (error) return alert(error.message);
      window.location.reload();
    };
    box.querySelector('[data-action="role-admin"]').onclick = () => role("ADMIN");
    box.querySelector('[data-action="role-supporter"]').onclick = () => role("SUPPORTER");
    box.querySelector('[data-action="role-member"]').onclick = () => role("MEMBER");
  }
}

async function enhanceModal(modal) {
  if (modal.dataset.ecEnhanced) return;
  modal.dataset.ecEnhanced = "1";
  const ctx = await currentContext();
  if (!ctx) return;
  const target = await resolveTarget(modal);
  addTools(modal, ctx, target);
}

const observer = new MutationObserver(() => {
  document.querySelectorAll(".profile-modal").forEach((m) => enhanceModal(m));
});
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener("load", () => document.querySelectorAll(".profile-modal").forEach(enhanceModal));
