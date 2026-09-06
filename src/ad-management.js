import { supabase } from "./supabaseClient";

const MIN_VISIBLE_SLOTS = 4;
let syncing = false;
let currentAds = [];
let isHeadAdmin = false;

function adList() {
  return document.querySelector(".community-ad-list");
}

function clearPlaceholders(list) {
  list?.querySelectorAll(".community-ad-placeholder-card").forEach((node) => node.remove());
}

function addPlaceholders(list, count) {
  clearPlaceholders(list);
  for (let i = 0; i < count; i += 1) {
    const slot = document.createElement("article");
    slot.className = "community-ad-card community-ad-placeholder-card";
    slot.innerHTML = '<div class="community-ad-free-slot"><span>WERBEPLATZ FREI</span><strong>Hier könnte dein Angebot stehen</strong><small>Regional · kompakt · sichtbar</small></div>';
    list.appendChild(slot);
  }
}

function makeField(labelText, value = "", type = "text") {
  const label = document.createElement("label");
  label.className = "ec-ad-editor-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = type === "textarea" ? document.createElement("textarea") : document.createElement("input");
  if (type !== "textarea") input.type = type;
  input.value = value || "";
  label.append(span, input);
  return { label, input };
}

async function uploadAdImage(file) {
  if (!file || !file.name || !file.size) return null;
  if (!file.type.startsWith("image/")) throw new Error("Bitte eine Bilddatei auswählen.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Das Werbebild darf höchstens 5 MB groß sein.");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) throw new Error("Bitte erneut anmelden.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/ads/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
  return data?.publicUrl || null;
}

function openEditor(ad) {
  const overlay = document.createElement("div");
  overlay.className = "ec-ad-editor-overlay";
  const form = document.createElement("form");
  form.className = "ec-ad-editor";
  form.innerHTML = '<div class="ec-ad-editor-head"><div><small>WERBEFLÄCHE</small><h2>Anzeige bearbeiten</h2></div><button type="button" class="ec-ad-editor-close">×</button></div>';

  const title = makeField("Firma / Verein (optional)", ad.title === "Werbeanzeige" ? "" : ad.title);
  const link = makeField("Webseite / Ziel-Link (optional)", ad.link_url || "", "url");
  const imageUrl = makeField("Bild-URL (optional)", ad.image_url || "", "url");
  const body = makeField("Kurztext (optional)", ad.body || "", "textarea");
  body.input.rows = 4;

  const upload = document.createElement("label");
  upload.className = "ec-ad-editor-field";
  const uploadText = document.createElement("span");
  uploadText.textContent = "Neues Werbebild hochladen (optional)";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  upload.append(uploadText, uploadInput);

  const actions = document.createElement("div");
  actions.className = "ec-ad-editor-actions";
  actions.innerHTML = '<button type="button" class="secondary-button ec-ad-cancel">Abbrechen</button><button class="primary-button">Änderungen speichern</button>';

  form.append(title.label, link.label, imageUrl.label, upload, body.label, actions);
  overlay.appendChild(form);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  form.querySelector(".ec-ad-editor-close")?.addEventListener("click", close);
  form.querySelector(".ec-ad-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const save = actions.querySelector(".primary-button");
    save.disabled = true;
    save.textContent = "Speichert …";
    try {
      let nextImage = imageUrl.input.value.trim() || null;
      const uploaded = await uploadAdImage(uploadInput.files?.[0]);
      if (uploaded) nextImage = uploaded;
      const payload = {
        title: title.input.value.trim() || "Werbeanzeige",
        link_url: link.input.value.trim() || null,
        image_url: nextImage,
        body: body.input.value.trim()
      };
      const { error } = await supabase.from("community_ads").update(payload).eq("id", ad.id);
      if (error) throw error;
      close();
      await syncAds(true);
    } catch (error) {
      window.alert(`Werbeanzeige konnte nicht gespeichert werden: ${error?.message || error}`);
      save.disabled = false;
      save.textContent = "Änderungen speichern";
    }
  });
}

function decorateCards() {
  const list = adList();
  if (!list) return;
  const cards = [...list.querySelectorAll(":scope > .community-ad-card:not(.community-ad-placeholder-card)")];

  cards.forEach((card, index) => {
    const ad = currentAds[index];
    if (!ad) return;
    card.dataset.adId = ad.id;

    const image = card.querySelector("img");
    if (image) {
      image.classList.add("ec-ad-image-full");
      image.loading = "lazy";
    }

    if (isHeadAdmin && !card.querySelector(".community-ad-edit")) {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "community-ad-edit";
      edit.textContent = "Bearbeiten";
      edit.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(ad);
      });
      card.appendChild(edit);
    }
  });

  addPlaceholders(list, Math.max(0, MIN_VISIBLE_SLOTS - cards.length));
}

async function syncAds(force = false) {
  if (!supabase || syncing || !adList()) return;
  syncing = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;
    const [{ data: profile }, { data: ads, error }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("community_ads").select("*").eq("is_active", true).order("created_at", { ascending: false })
    ]);
    if (error) throw error;
    isHeadAdmin = profile?.role === "HEAD_ADMIN";
    currentAds = ads || [];
    decorateCards();
    if (force) window.setTimeout(decorateCards, 100);
  } catch (error) {
    console.error("Werbeflächen konnten nicht synchronisiert werden:", error);
  } finally {
    syncing = false;
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => syncAds(), { once: true });
else syncAds();

const observer = new MutationObserver(() => {
  if (adList()) window.requestAnimationFrame(() => syncAds());
});
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener("visibilitychange", () => { if (!document.hidden) syncAds(true); });
window.addEventListener("focus", () => syncAds(true));
