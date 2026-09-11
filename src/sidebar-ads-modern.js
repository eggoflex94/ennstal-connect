import { supabase } from "./supabaseClient";

let viewerId = "";
let isHeadAdmin = false;
let activeRegionId = null;
let activeRegionName = "Region";
let currentAds = [];
let syncing = false;
let renderQueued = false;

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));

function dock() {
  return document.querySelector(".ec-right-dock");
}

function removeLegacyActivityBlocks() {
  const root = dock();
  if (!root) return;
  for (const key of ["updates", "actions"]) {
    root.querySelector(`[data-ec-detail="${key}"]`)?.remove();
    root.querySelector(`.ec-dock-detail[data-panel="${key}"]`)?.remove();
  }
}

function ensureHost() {
  const root = dock();
  if (!root) return null;
  removeLegacyActivityBlocks();

  let host = root.querySelector(".ec-sidebar-ads");
  if (!host) {
    host = document.createElement("section");
    host.className = "ec-sidebar-ads";
    host.setAttribute("aria-label", "Regionale Werbung");
    const logout = root.querySelector(".ec-logout");
    if (logout) logout.insertAdjacentElement("afterend", host);
    else root.appendChild(host);
  }
  return host;
}

function safeHref(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function cardMarkup(ad) {
  const href = safeHref(ad.link_url);
  const title = esc(ad.title || "Werbeanzeige");
  const body = esc(ad.body || "");
  const image = safeHref(ad.image_url);
  const media = image
    ? `<div class="ec-sidebar-ad-media"><img src="${esc(image)}" alt="${title}" loading="lazy" decoding="async"></div>`
    : "";
  const content = `<div class="ec-sidebar-ad-copy"><strong>${title}</strong>${body ? `<span>${body}</span>` : ""}</div>`;
  const linked = href
    ? `<a class="ec-sidebar-ad-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer sponsored">${media}${content}</a>`
    : `<div class="ec-sidebar-ad-link">${media}${content}</div>`;
  const admin = isHeadAdmin
    ? `<div class="ec-sidebar-ad-admin"><button type="button" data-ad-edit="${esc(ad.id)}">Bearbeiten</button><button type="button" class="danger" data-ad-remove="${esc(ad.id)}">Entfernen</button></div>`
    : "";
  return `<article class="ec-sidebar-ad-card" data-ad-id="${esc(ad.id)}">${linked}${admin}</article>`;
}

function render() {
  const host = ensureHost();
  if (!host) return;

  if (!currentAds.length && !isHeadAdmin) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }

  host.hidden = false;
  host.innerHTML = `
    <div class="ec-sidebar-ads-head">
      <div><span>REGIONAL · WERBUNG</span><strong>${esc(activeRegionName)}</strong></div>
      ${isHeadAdmin ? '<button type="button" class="ec-sidebar-ad-add">+ Banner</button>' : ""}
    </div>
    <div class="ec-sidebar-ad-list">
      ${currentAds.length ? currentAds.map(cardMarkup).join("") : '<div class="ec-sidebar-ad-empty"><strong>Noch kein Banner aktiv</strong><span>Als Hauptadmin kannst du hier direkt eine Werbung hochladen.</span></div>'}
    </div>
  `;

  host.querySelector(".ec-sidebar-ad-add")?.addEventListener("click", () => openEditor(null));
  host.querySelectorAll("[data-ad-edit]").forEach((button) => {
    button.addEventListener("click", () => openEditor(currentAds.find((ad) => ad.id === button.dataset.adEdit) || null));
  });
  host.querySelectorAll("[data-ad-remove]").forEach((button) => {
    button.addEventListener("click", () => deactivateAd(button.dataset.adRemove));
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

async function resolveContext() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return false;
  viewerId = user.id;

  const [{ data: profile }, { data: regions }] = await Promise.all([
    supabase.from("profiles").select("role,home_region_id").eq("id", user.id).maybeSingle(),
    supabase.from("regions").select("id,slug,name").eq("is_active", true),
  ]);

  isHeadAdmin = String(profile?.role || "").toUpperCase() === "HEAD_ADMIN";
  const savedSlug = localStorage.getItem("ec-active-region");
  const selected = (regions || []).find((region) => region.slug === savedSlug)
    || (regions || []).find((region) => region.id === profile?.home_region_id)
    || (regions || [])[0]
    || null;
  activeRegionId = selected?.id || null;
  activeRegionName = selected?.name || "Region";
  return true;
}

async function loadAds() {
  let query = supabase
    .from("community_ads")
    .select("id,title,body,image_url,link_url,is_active,created_at,region_id")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (activeRegionId) query = query.or(`region_id.eq.${activeRegionId},region_id.is.null`);
  else query = query.is("region_id", null);

  const { data, error } = await query;
  if (error) throw error;
  currentAds = data || [];
}

async function syncAds() {
  if (!supabase || syncing) return;
  syncing = true;
  try {
    if (!(await resolveContext())) return;
    await loadAds();
    render();
  } catch (error) {
    console.error("Sidebar-Werbung konnte nicht geladen werden:", error);
    scheduleRender();
  } finally {
    syncing = false;
  }
}

async function uploadImage(file) {
  if (!file) return null;
  if (!file.type?.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Das Werbebild darf höchstens 5 MB groß sein.");
  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${viewerId}/ads/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, {
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  return data?.publicUrl || null;
}

function makeField(labelText, name, value = "", type = "text") {
  const label = document.createElement("label");
  label.className = "ec-sidebar-ad-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement(type === "textarea" ? "textarea" : "input");
  input.name = name;
  if (type !== "textarea") input.type = type;
  input.value = value || "";
  if (type === "textarea") input.rows = 3;
  label.append(span, input);
  return { label, input };
}

function openEditor(ad) {
  if (!isHeadAdmin) return;
  document.querySelector(".ec-sidebar-ad-editor-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "ec-sidebar-ad-editor-overlay";
  const form = document.createElement("form");
  form.className = "ec-sidebar-ad-editor";
  form.innerHTML = `<header><div><span>WERBEBANNER</span><h2>${ad ? "Banner bearbeiten" : "Banner hochladen"}</h2><small>${esc(activeRegionName)}</small></div><button type="button" class="ec-sidebar-ad-close" aria-label="Schließen">×</button></header>`;

  const title = makeField("Firma / Titel", "title", ad?.title || "");
  const link = makeField("Ziel-Link (optional)", "link", ad?.link_url || "", "url");
  const imageUrl = makeField("Bild-URL (optional)", "imageUrl", ad?.image_url || "", "url");
  const body = makeField("Kurztext (optional)", "body", ad?.body || "", "textarea");
  const upload = makeField(ad ? "Neues Bild hochladen (optional)" : "Werbebild hochladen", "image", "", "file");
  upload.input.accept = "image/*";

  const hint = document.createElement("p");
  hint.className = "ec-sidebar-ad-hint";
  hint.textContent = "Empfohlen: Querformat. Das Bild wird automatisch an die Breite des Dashboards angepasst und nie darüber hinaus skaliert.";

  const actions = document.createElement("div");
  actions.className = "ec-sidebar-ad-editor-actions";
  actions.innerHTML = '<button type="button" class="secondary ec-sidebar-ad-cancel">Abbrechen</button><button type="submit" class="primary">Speichern</button>';
  form.append(title.label, link.label, imageUrl.label, upload.label, body.label, hint, actions);
  overlay.appendChild(form);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  form.querySelector(".ec-sidebar-ad-close")?.addEventListener("click", close);
  form.querySelector(".ec-sidebar-ad-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const save = actions.querySelector(".primary");
    save.disabled = true;
    save.textContent = "Speichert …";
    try {
      const uploadedUrl = await uploadImage(upload.input.files?.[0]);
      const nextImage = uploadedUrl || imageUrl.input.value.trim() || ad?.image_url || null;
      if (!ad && !nextImage) throw new Error("Bitte ein Werbebild hochladen oder eine Bild-URL eintragen.");

      const payload = {
        title: title.input.value.trim() || "Werbeanzeige",
        body: body.input.value.trim(),
        image_url: nextImage,
        link_url: link.input.value.trim() || null,
      };

      if (ad?.id) {
        const { error } = await supabase.from("community_ads").update(payload).eq("id", ad.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_ads").insert({
          ...payload,
          is_active: true,
          created_by: viewerId,
          region_id: activeRegionId,
        });
        if (error) throw error;
      }

      close();
      await loadAds();
      render();
      window.dispatchEvent(new CustomEvent("ec:community-ads-refresh"));
    } catch (error) {
      window.alert(`Werbebanner konnte nicht gespeichert werden: ${error?.message || error}`);
      save.disabled = false;
      save.textContent = "Speichern";
    }
  });
}

async function deactivateAd(id) {
  if (!isHeadAdmin || !id) return;
  if (!window.confirm("Diesen Werbebanner entfernen?")) return;
  try {
    const { error } = await supabase.from("community_ads").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    await loadAds();
    render();
    window.dispatchEvent(new CustomEvent("ec:community-ads-refresh"));
  } catch (error) {
    window.alert(`Werbebanner konnte nicht entfernt werden: ${error?.message || error}`);
  }
}

function boot() {
  ensureHost();
  void syncAds();
  const observer = new MutationObserver(() => {
    removeLegacyActivityBlocks();
    if (!dock()?.querySelector(".ec-sidebar-ads")) scheduleRender();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("ec:region-change", () => window.setTimeout(() => void syncAds(), 80));
  window.addEventListener("ec:community-ads-refresh", () => window.setTimeout(() => void syncAds(), 80));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void syncAds(); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
