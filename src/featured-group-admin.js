import { supabase } from "./supabaseClient";

let mounting = false;
const parseRow = (row) => {
  if (!row) return null;
  if (typeof row !== "string") return row;
  try { return JSON.parse(row); } catch { return null; }
};
const parseRows = (rows) => (Array.isArray(rows) ? rows : rows ? [rows] : []).map(parseRow).filter(Boolean);
const msg = (panel, text, error = false) => {
  const node = panel.querySelector(".featured-group-admin-message");
  if (node) {
    node.textContent = text;
    node.classList.toggle("error", error);
  }
};
const refresh = () => setTimeout(() => location.reload(), 450);

async function load() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,account_status,home_region_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "HEAD_ADMIN" || profile?.account_status !== "ACTIVE") return null;

  const [{ data: groupRows, error: groupError }, { data: featuredRows, error: featuredError }, { data: regions, error: regionError }] = await Promise.all([
    supabase.rpc("community_group_directory"),
    supabase.rpc("featured_community_group"),
    supabase.from("regions").select("id,slug,name").eq("is_active", true)
  ]);
  if (groupError) throw groupError;
  if (featuredError) throw featuredError;
  if (regionError) throw regionError;

  const allGroups = parseRows(groupRows);
  const allFeatured = parseRows(featuredRows);
  const savedSlug = localStorage.getItem("ec-active-region");
  const activeRegion = (regions || []).find((region) => region.slug === savedSlug)
    || (regions || []).find((region) => region.id === profile.home_region_id)
    || (regions || [])[0]
    || null;
  const groups = activeRegion?.id && allGroups.some((group) => group.region_id)
    ? allGroups.filter((group) => group.region_id === activeRegion.id)
    : allGroups;
  const featured = activeRegion?.id
    ? allFeatured.find((group) => !group.region_id || group.region_id === activeRegion.id) || null
    : allFeatured[0] || null;

  return { user, groups, featured, activeRegion };
}

async function upload(uid, file) {
  if (!file?.size) return null;
  if (!file.type.startsWith("image/")) throw Error("Bitte eine Bilddatei auswählen.");
  if (file.size > 5 * 1024 * 1024) throw Error("Das Gruppenbild darf höchstens 5 MB groß sein.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${uid}/groups/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("profile-avatars").getPublicUrl(path).data?.publicUrl || null;
}

function fill(panel, group) {
  panel.querySelector("[name=featured_group_name]").value = group?.name || "";
  panel.querySelector("[name=featured_group_description]").value = group?.description || "";
  panel.querySelector("[name=featured_group_image_url]").value = group?.image_url || "";
  const preview = panel.querySelector(".featured-group-admin-selected-preview");
  preview.replaceChildren();
  if (!group) {
    preview.textContent = "Keine Gruppe ausgewählt.";
    return;
  }
  if (group.image_url) {
    const image = document.createElement("img");
    image.src = group.image_url;
    image.alt = "";
    preview.append(image);
  }
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const description = document.createElement("small");
  title.textContent = group.name || "Gruppe";
  description.textContent = group.description || "Keine Beschreibung hinterlegt.";
  copy.append(title, description);
  preview.append(copy);
}

function render(root, state) {
  root.querySelector(".featured-group-admin-panel")?.remove();
  const panel = document.createElement("details");
  panel.className = "panel featured-group-admin-panel";
  panel.innerHTML = `<summary class="featured-group-admin-summary"><span class="featured-group-icon">🏆</span><span><strong>Gruppe der Woche</strong><small>${state.featured?.name ? `Aktuell: ${state.featured.name}` : "Keine Gruppe hervorgehoben"}</small></span><span class="featured-group-chevron">⌄</span></summary><div class="featured-group-admin-body"><p class="featured-group-admin-hint">${state.activeRegion?.name ? `Region: ${state.activeRegion.name} · ` : ""}Optional · Hervorgehobene Gruppe auf der Startseite verwalten.</p><div class="featured-group-admin-current"><span>Aktuell hervorgehoben</span><strong class="featured-group-current-name"></strong></div><label class="featured-group-admin-field">Gruppe auswählen<select name="featured_group_select"></select></label><div class="featured-group-admin-actions featured-group-admin-primary-actions"><button type="button" class="primary-button featured-group-set">Als Gruppe der Woche setzen / austauschen</button><button type="button" class="secondary-button featured-group-unset">Hervorhebung entfernen</button></div><details class="featured-group-editor"><summary>Ausgewählte Gruppe bearbeiten</summary><div class="featured-group-admin-selected-preview"></div><label class="featured-group-admin-field">Gruppenname<input name="featured_group_name" type="text"></label><label class="featured-group-admin-field">Beschreibung<textarea name="featured_group_description" rows="4"></textarea></label><label class="featured-group-admin-field">Bild-URL<input name="featured_group_image_url" type="url" placeholder="https://..."></label><label class="featured-group-admin-field">Oder neues Gruppenbild hochladen<input name="featured_group_image" type="file" accept="image/*"></label><div class="featured-group-admin-actions"><button type="button" class="secondary-button featured-group-save">Änderungen speichern</button><button type="button" class="danger-button featured-group-delete">Gruppe endgültig löschen</button></div></details><div class="featured-group-admin-message" aria-live="polite"></div></div>`;

  const candidates = [...root.querySelectorAll("section,.panel")].filter((node) => node !== panel);
  const anchor = candidates.at(-1);
  anchor?.after(panel) || root.append(panel);

  const select = panel.querySelector("[name=featured_group_select]");
  const current = panel.querySelector(".featured-group-current-name");
  current.textContent = state.featured?.name || "Keine Gruppe ausgewählt";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = state.groups.length ? "Bitte Gruppe auswählen" : "Keine Gruppen in dieser Region vorhanden";
  select.append(empty);
  state.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name || "Unbenannte Gruppe";
    select.append(option);
  });
  select.value = state.featured?.id && state.groups.some((group) => group.id === state.featured.id) ? state.featured.id : "";
  const chosen = () => state.groups.find((group) => group.id === select.value) || null;
  fill(panel, chosen());
  select.onchange = () => fill(panel, chosen());

  panel.querySelector(".featured-group-set").onclick = async () => {
    const group = chosen();
    if (!group) return msg(panel, "Bitte zuerst eine Gruppe auswählen.", true);
    const regionId = group.region_id || state.activeRegion?.id;
    if (!regionId) return msg(panel, "Die aktive Region konnte nicht ermittelt werden.", true);
    const { error } = await supabase.rpc("ec_set_regional_featured_group", { p_group_id: group.id, p_region: regionId });
    if (error) return msg(panel, error.message, true);
    msg(panel, `„${group.name}“ ist jetzt die Gruppe der Woche in ${state.activeRegion?.name || "dieser Region"}.`);
    refresh();
  };

  panel.querySelector(".featured-group-unset").onclick = async () => {
    if (!state.featured) return msg(panel, "Aktuell ist keine Gruppe hervorgehoben.");
    if (!confirm(`Hervorhebung von „${state.featured.name || "Gruppe"}“ entfernen?`)) return;
    const regionId = state.featured.region_id || state.activeRegion?.id;
    if (!regionId) return msg(panel, "Die aktive Region konnte nicht ermittelt werden.", true);
    const { error } = await supabase.rpc("ec_set_regional_featured_group", { p_group_id: null, p_region: regionId });
    if (error) return msg(panel, error.message, true);
    refresh();
  };

  panel.querySelector(".featured-group-save").onclick = async () => {
    const group = chosen();
    if (!group) return msg(panel, "Bitte zuerst eine Gruppe auswählen.", true);
    const name = panel.querySelector("[name=featured_group_name]").value.trim();
    const description = panel.querySelector("[name=featured_group_description]").value.trim();
    let image = panel.querySelector("[name=featured_group_image_url]").value.trim() || null;
    if (name.length < 3 || description.length < 10) return msg(panel, "Name oder Beschreibung ist zu kurz.", true);
    try {
      const uploaded = await upload(state.user.id, panel.querySelector("[name=featured_group_image]").files?.[0]);
      if (uploaded) image = uploaded;
      const { error } = await supabase.rpc("update_community_group", { p_group_id: group.id, p_name: name, p_description: description, p_image_url: image });
      if (error) throw error;
      refresh();
    } catch (error) {
      msg(panel, error.message || "Speichern fehlgeschlagen.", true);
    }
  };

  panel.querySelector(".featured-group-delete").onclick = async () => {
    const group = chosen();
    if (!group) return;
    if (!confirm(`Gruppe „${group.name}“ wirklich endgültig löschen?`)) return;
    if (prompt(`Zur Sicherheit Gruppennamen exakt eingeben:\n${group.name}`, "") !== group.name) return msg(panel, "Löschen abgebrochen.", true);
    const { error } = await supabase.rpc("delete_community_group", { p_group_id: group.id });
    if (error) return msg(panel, error.message, true);
    refresh();
  };
}

async function mount() {
  if (mounting) return;
  const root = document.querySelector(".admin-page");
  if (!root || root.querySelector(".featured-group-admin-panel")) return;
  mounting = true;
  try {
    const state = await load();
    if (state && document.querySelector(".admin-page") === root) render(root, state);
  } catch (error) {
    console.warn("Gruppe der Woche:", error?.message || error);
  } finally {
    mounting = false;
  }
}

let timer;
const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(() => void mount(), 250);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("ec:region-change", () => {
  document.querySelector(".featured-group-admin-panel")?.remove();
  void mount();
});
void mount();