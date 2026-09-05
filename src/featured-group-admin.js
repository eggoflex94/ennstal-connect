import { supabase } from "./supabaseClient";

let mounting = false;

const parseRow = (row) => {
  if (!row) return null;
  if (typeof row !== "string") return row;
  try { return JSON.parse(row); } catch { return null; }
};

const parseRows = (rows) => (Array.isArray(rows) ? rows : rows ? [rows] : [])
  .map(parseRow)
  .filter(Boolean);

const showMessage = (panel, text, error = false) => {
  const target = panel.querySelector(".featured-group-admin-message");
  if (!target) return;
  target.textContent = text;
  target.classList.toggle("error", error);
};

const refreshApp = () => window.setTimeout(() => window.location.reload(), 450);

async function loadHeadAdminData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,account_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "HEAD_ADMIN" || profile?.account_status !== "ACTIVE") return null;

  const [{ data: groupRows, error: groupsError }, { data: featuredRows, error: featuredError }] = await Promise.all([
    supabase.rpc("community_group_directory"),
    supabase.rpc("featured_community_group")
  ]);

  if (groupsError) throw groupsError;
  if (featuredError) throw featuredError;

  return {
    user,
    groups: parseRows(groupRows),
    featured: parseRows(featuredRows)[0] || null
  };
}

async function uploadGroupImage(userId, file) {
  if (!file || !file.name || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Das Gruppenbild darf höchstens 5 MB groß sein.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/groups/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, {
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;

  const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Für das Gruppenbild konnte keine URL erstellt werden.");
  return data.publicUrl;
}

function fillEditor(panel, group) {
  panel.querySelector("[name='featured_group_name']").value = group?.name || "";
  panel.querySelector("[name='featured_group_description']").value = group?.description || "";
  panel.querySelector("[name='featured_group_image_url']").value = group?.image_url || "";

  const preview = panel.querySelector(".featured-group-admin-selected-preview");
  preview.replaceChildren();
  if (!group) {
    preview.textContent = "Keine Gruppe ausgewählt.";
    return;
  }

  if (group.image_url) {
    const img = document.createElement("img");
    img.src = group.image_url;
    img.alt = "";
    preview.appendChild(img);
  }
  const text = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = group.name || "Gruppe";
  const small = document.createElement("small");
  small.textContent = group.description || "Keine Beschreibung hinterlegt.";
  text.append(strong, small);
  preview.appendChild(text);
}

function renderPanel(root, state) {
  const old = root.querySelector(".featured-group-admin-panel");
  old?.remove();

  const panel = document.createElement("section");
  panel.className = "panel featured-group-admin-panel";
  panel.innerHTML = `
    <div class="featured-group-admin-heading">
      <div><span class="eyebrow">GLOBAL ADMIN</span><h2>Gruppe der Woche verwalten</h2><p>Hier kannst du die hervorgehobene Gruppe austauschen, bearbeiten, entfernen oder endgültig löschen.</p></div>
      <span class="featured-group-admin-badge">♛ Head Admin</span>
    </div>
    <div class="featured-group-admin-current">
      <span>Aktuell hervorgehoben</span>
      <strong class="featured-group-current-name"></strong>
    </div>
    <label class="featured-group-admin-field">Gruppe auswählen
      <select name="featured_group_select"></select>
    </label>
    <div class="featured-group-admin-actions featured-group-admin-primary-actions">
      <button type="button" class="primary-button featured-group-set">Als Gruppe der Woche setzen / austauschen</button>
      <button type="button" class="secondary-button featured-group-unset">Hervorhebung entfernen</button>
    </div>
    <div class="featured-group-admin-divider"></div>
    <h3>Ausgewählte Gruppe bearbeiten</h3>
    <div class="featured-group-admin-selected-preview"></div>
    <label class="featured-group-admin-field">Gruppenname<input name="featured_group_name" type="text" /></label>
    <label class="featured-group-admin-field">Beschreibung<textarea name="featured_group_description" rows="5"></textarea></label>
    <label class="featured-group-admin-field">Bild-URL<input name="featured_group_image_url" type="url" placeholder="https://..." /></label>
    <label class="featured-group-admin-field">Oder neues Gruppenbild hochladen<input name="featured_group_image" type="file" accept="image/*" /></label>
    <div class="featured-group-admin-actions">
      <button type="button" class="secondary-button featured-group-save">Änderungen speichern</button>
      <button type="button" class="danger-button featured-group-delete">Gruppe endgültig löschen</button>
    </div>
    <div class="featured-group-admin-message" aria-live="polite"></div>
  `;

  const heading = root.querySelector(".page-heading");
  if (heading?.nextSibling) root.insertBefore(panel, heading.nextSibling);
  else root.prepend(panel);

  const select = panel.querySelector("[name='featured_group_select']");
  const currentName = panel.querySelector(".featured-group-current-name");
  currentName.textContent = state.featured?.name || "Keine Gruppe ausgewählt";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = state.groups.length ? "Bitte Gruppe auswählen" : "Keine Gruppen vorhanden";
  select.appendChild(empty);

  state.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name || "Unbenannte Gruppe";
    select.appendChild(option);
  });

  select.value = state.featured?.id && state.groups.some((group) => group.id === state.featured.id)
    ? state.featured.id
    : state.groups[0]?.id || "";

  const selectedGroup = () => state.groups.find((group) => group.id === select.value) || null;
  fillEditor(panel, selectedGroup());
  select.addEventListener("change", () => fillEditor(panel, selectedGroup()));

  panel.querySelector(".featured-group-set").addEventListener("click", async () => {
    const group = selectedGroup();
    if (!group) return showMessage(panel, "Bitte zuerst eine Gruppe auswählen.", true);
    showMessage(panel, "Speichere Gruppe der Woche …");
    const { error } = await supabase.rpc("set_featured_community_group", { p_group_id: group.id });
    if (error) return showMessage(panel, error.message, true);
    showMessage(panel, `„${group.name}“ ist jetzt die Gruppe der Woche.`);
    refreshApp();
  });

  panel.querySelector(".featured-group-unset").addEventListener("click", async () => {
    if (!state.featured) return showMessage(panel, "Aktuell ist keine Gruppe hervorgehoben.");
    if (!window.confirm(`Hervorhebung von „${state.featured.name || "Gruppe"}“ entfernen? Die Gruppe selbst bleibt bestehen.`)) return;
    const { error } = await supabase.rpc("set_featured_community_group", { p_group_id: null });
    if (error) return showMessage(panel, error.message, true);
    showMessage(panel, "Die Hervorhebung wurde entfernt. Die Gruppe bleibt erhalten.");
    refreshApp();
  });

  panel.querySelector(".featured-group-save").addEventListener("click", async () => {
    const group = selectedGroup();
    if (!group) return showMessage(panel, "Bitte zuerst eine Gruppe auswählen.", true);

    const name = panel.querySelector("[name='featured_group_name']").value.trim();
    const description = panel.querySelector("[name='featured_group_description']").value.trim();
    let imageUrl = panel.querySelector("[name='featured_group_image_url']").value.trim() || null;
    const imageFile = panel.querySelector("[name='featured_group_image']").files?.[0];

    if (name.length < 3) return showMessage(panel, "Der Gruppenname muss mindestens 3 Zeichen haben.", true);
    if (description.length < 10) return showMessage(panel, "Die Beschreibung muss mindestens 10 Zeichen haben.", true);

    try {
      showMessage(panel, "Speichere Gruppenänderungen …");
      const uploaded = await uploadGroupImage(state.user.id, imageFile);
      if (uploaded) imageUrl = uploaded;
      const { error } = await supabase.rpc("update_community_group", {
        p_group_id: group.id,
        p_name: name,
        p_description: description,
        p_image_url: imageUrl
      });
      if (error) throw error;
      showMessage(panel, "Gruppe wurde gespeichert.");
      refreshApp();
    } catch (error) {
      showMessage(panel, error?.message || "Die Gruppe konnte nicht gespeichert werden.", true);
    }
  });

  panel.querySelector(".featured-group-delete").addEventListener("click", async () => {
    const group = selectedGroup();
    if (!group) return showMessage(panel, "Bitte zuerst eine Gruppe auswählen.", true);
    if (!window.confirm(`Gruppe „${group.name}“ wirklich endgültig löschen? Dieser Schritt kann nicht rückgängig gemacht werden.`)) return;
    const typed = window.prompt(`Zur Sicherheit bitte den Gruppennamen exakt eingeben:\n${group.name}`, "");
    if (typed !== group.name) return showMessage(panel, "Löschen abgebrochen: Gruppenname stimmt nicht überein.", true);

    showMessage(panel, "Lösche Gruppe …");
    const { error } = await supabase.rpc("delete_community_group", { p_group_id: group.id });
    if (error) return showMessage(panel, error.message, true);
    showMessage(panel, `„${group.name}“ wurde endgültig gelöscht.`);
    refreshApp();
  });
}

async function mountFeaturedGroupAdmin() {
  if (!supabase || mounting) return;
  const root = document.querySelector(".admin-page");
  if (!root || root.querySelector(".featured-group-admin-panel")) return;

  mounting = true;
  try {
    const state = await loadHeadAdminData();
    if (state && document.querySelector(".admin-page") === root) renderPanel(root, state);
  } catch (error) {
    console.warn("Gruppe-der-Woche-Verwaltung konnte nicht geladen werden:", error?.message || error);
  } finally {
    mounting = false;
  }
}

const observer = new MutationObserver(() => { void mountFeaturedGroupAdmin(); });
observer.observe(document.documentElement, { childList: true, subtree: true });
void mountFeaturedGroupAdmin();
