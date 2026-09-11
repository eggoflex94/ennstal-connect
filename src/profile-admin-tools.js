import { supabase } from "./supabaseClient";

const HEAD = "HEAD_ADMIN";
const esc = (s) => String(s ?? "").replace(/[&<>\"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const nameOf = (p) => p?.nickname || [p?.first_name,p?.last_name].filter(Boolean).join(" ") || "Mitglied";
let busy = false;
let timer = null;

async function currentContext() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data: me } = await supabase.from("profiles").select("id,role,account_status").eq("id", session.user.id).maybeSingle();
  if (!me || me.role !== HEAD || me.account_status !== "ACTIVE") return null;
  return { user: session.user, me };
}

async function resolveTarget(host) {
  const directId = host?.dataset?.profileId || host?.getAttribute?.("data-profile-id") || "";
  if (directId) {
    const { data } = await supabase.from("profiles").select("*").eq("id", directId).maybeSingle();
    if (data) return data;
  }
  const shown = host?.querySelector(".member-title-line h1, .modal-profile-header h1, .member-profile-hero h1, h1")?.textContent?.trim();
  if (!shown) return null;
  const { data } = await supabase.from("profiles").select("*");
  const list = data || [];
  return list.find((p) => nameOf(p) === shown) || null;
}

async function loadRegional(targetId) {
  const [{ data: regions }, { data: assignments }] = await Promise.all([
    supabase.from("regions").select("id,slug,name").eq("is_active", true).order("sort_order"),
    supabase.from("regional_admin_assignments").select("region_id,active").eq("user_id", targetId).eq("active", true)
  ]);
  return { regions: regions || [], assignments: assignments || [] };
}

async function changeRole(target, newRole, button) {
  if (button.disabled || target.role === newRole) return;
  const labels = { MEMBER: "Mitglied", SUPPORTER: "Supporter", ADMIN: "Global Admin" };
  if (!confirm(`${nameOf(target)} wirklich auf „${labels[newRole]}“ setzen?`)) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Wird gespeichert …";
  const { error } = await supabase.rpc("admin_set_role", { target_user: target.id, new_role: newRole });
  if (error) {
    button.disabled = false;
    button.textContent = original;
    return alert(error.message);
  }
  alert(`Rolle von ${nameOf(target)} wurde auf „${labels[newRole]}“ gesetzt.`);
  location.reload();
}

async function setRegional(target, region, enabled, button) {
  if (button.disabled) return;
  const action = enabled ? "vergeben" : "entfernen";
  if (!confirm(`Regional-Admin-Recht für ${region.name} bei ${nameOf(target)} wirklich ${action}?`)) return;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = enabled ? "Wird vergeben …" : "Wird entfernt …";
  const { error } = await supabase.rpc("ec_set_regional_admin", { p_target: target.id, p_region_slug: region.slug, p_enabled: enabled });
  if (error) {
    button.disabled = false;
    button.textContent = original;
    return alert(error.message);
  }
  alert(enabled ? `Regional Admin für ${region.name} vergeben.` : `Regional Admin für ${region.name} entfernt.`);
  location.reload();
}

async function warn(target, button) {
  const text = window.prompt(`Verwarnung an ${nameOf(target)}:`, "Bitte beachte die Community-Regeln. Dies ist eine offizielle Verwarnung.");
  if (!text?.trim()) return;
  button.disabled = true;
  const { error } = await supabase.rpc("admin_warn_user", { target_user: target.id, warning_text: text.trim() });
  button.disabled = false;
  if (error) return alert(error.message);
  alert("Verwarnung wurde als Nachricht gesendet.");
}

function buildPanel(ctx, target, regional) {
  const box = document.createElement("section");
  box.className = "panel ec-profile-admin-tools";
  box.dataset.profileAdminTools = "1";
  const active = regional.assignments.map((a) => regional.regions.find((r) => r.id === a.region_id)).filter(Boolean);
  const available = regional.regions.filter((r) => !active.some((a) => a.id === r.id));

  box.innerHTML = `
    <div class="ec-profile-admin-head">
      <div><span class="eyebrow">HEAD ADMIN · MITGLIEDSVERWALTUNG</span><h2>Admin Tools</h2><p>Rolle und regionale Admin-Rechte direkt bei ${esc(nameOf(target))} verwalten.</p></div>
    </div>
    <div class="ec-profile-admin-role-grid">
      <button type="button" class="secondary-button" data-role="MEMBER">Als Mitglied setzen</button>
      <button type="button" class="secondary-button" data-role="SUPPORTER">Als Supporter setzen</button>
      <button type="button" class="primary-button" data-role="ADMIN">Als Global Admin setzen</button>
      <button type="button" class="secondary-button" data-action="warn">Verwarnung senden</button>
    </div>
    <div class="ec-profile-admin-current"><strong>Aktuelle Rolle:</strong> ${esc(target.role === 'ADMIN' ? 'Global Admin' : target.role || "MEMBER")}</div>
    <div class="ec-profile-regional-admin-block">
      <h3>Regional-Admin-Rechte</h3>
      <div class="ec-profile-regional-list">
        ${active.length ? active.map((region) => `<div class="ec-profile-regional-row" data-region="${esc(region.slug)}"><span><strong>${esc(region.name)}</strong><small>Regional Admin aktiv</small></span><button type="button" class="danger-button" data-remove-region="${esc(region.slug)}">Herunterstufen / entfernen</button></div>`).join("") : `<p class="ec-profile-admin-empty">Keine aktive Regional-Admin-Zuweisung.</p>`}
      </div>
      ${available.length ? `<div class="ec-profile-regional-add"><select><option value="">Region auswählen …</option>${available.map((region) => `<option value="${esc(region.slug)}">${esc(region.name)}</option>`).join("")}</select><button type="button" class="secondary-button" data-action="add-regional">Regional Admin hinzufügen</button></div>` : ""}
    </div>`;

  box.querySelectorAll("[data-role]").forEach((button) => {
    button.disabled = target.role === button.dataset.role;
    button.onclick = () => void changeRole(target, button.dataset.role, button);
  });
  box.querySelector('[data-action="warn"]')?.addEventListener("click", (event) => void warn(target, event.currentTarget));
  box.querySelectorAll("[data-remove-region]").forEach((button) => {
    const region = regional.regions.find((r) => r.slug === button.dataset.removeRegion);
    if (region) button.onclick = () => void setRegional(target, region, false, button);
  });
  const add = box.querySelector('[data-action="add-regional"]');
  if (add) add.onclick = () => {
    const slug = box.querySelector(".ec-profile-regional-add select")?.value;
    const region = regional.regions.find((r) => r.slug === slug);
    if (region) void setRegional(target, region, true, add);
  };
  return box;
}

async function enhance(host) {
  if (!host || host.querySelector('[data-profile-admin-tools="1"]') || busy) return;
  busy = true;
  try {
    const ctx = await currentContext();
    if (!ctx) return;
    const target = await resolveTarget(host);
    if (!target || target.id === ctx.user.id || target.role === HEAD) return;
    const regional = await loadRegional(target.id);
    const panel = buildPanel(ctx, target, regional);
    const hero = host.querySelector(".member-profile-hero, .modal-profile-header");
    if (hero) hero.insertAdjacentElement("afterend", panel);
    else host.prepend(panel);
  } catch (error) {
    console.warn("[profile-admin-tools]", error?.message || error);
  } finally {
    busy = false;
  }
}

function sync() {
  document.querySelectorAll(".member-profile-page, .profile-modal").forEach((host) => void enhance(host));
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(sync, 60);
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("ec:navigate", schedule);
window.addEventListener("ec:open-profile", () => setTimeout(sync, 50));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync, { once: true }); else sync();
setTimeout(sync, 250);

export {};
