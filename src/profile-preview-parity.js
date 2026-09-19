import { supabase } from "./supabaseClient";
import "./profile-preview-parity.css";

const PREVIEW_SELECTOR = ".public-profile-preview";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));

function formatAge(value) {
  if (!value) return "";
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return `${age} Jahre`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("de-AT");
}

function isPublic(profile, field) {
  return String(profile?.privacy_settings?.[field] || "PUBLIC").toUpperCase() === "PUBLIC";
}

function row(label, value) {
  if (!value) return "";
  return `<div class="ec-mp-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function roleInfo(profile) {
  const role = String(profile?.role || "MEMBER").toUpperCase();
  if (role === "HEAD_ADMIN") return { label: "Hauptadmin", star: "/role-star-red.svg" };
  if (role === "ADMIN") return { label: "Global Admin", star: "/role-star-red.svg" };
  if (role === "SUPPORTER") return { label: "Supporter", star: "/supporter-star.svg" };
  if (profile?.account_badge === "BUSINESS") return { label: "Unternehmenskonto", star: "/role-star-blue.svg" };
  return { label: "Mitglied", star: "" };
}

function ensurePreviewBanner(page) {
  if (page.querySelector(":scope > .ec-profile-preview-banner")) return;
  const backButton = page.querySelector(":scope > .back-button");
  const banner = document.createElement("div");
  banner.className = "ec-profile-preview-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = "<strong>Ansicht für andere Mitglieder</strong><span>So sieht dein Profil ein nicht befreundetes Mitglied tatsächlich.</span>";
  if (backButton?.nextSibling) page.insertBefore(banner, backButton.nextSibling);
  else page.prepend(banner);
}

function buildPreviewActions(profile) {
  const actions = document.createElement("div");
  actions.className = "ec-mp-actions ec-preview-member-actions";
  const role = String(profile?.role || "MEMBER").toUpperCase();
  const labels = ["Nachricht", "Freundschaftsanfrage", ...(role === "ADMIN" || role === "HEAD_ADMIN" ? [] : ["Blockieren"]), "Nutzer melden"];
  for (const label of labels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ec-mp-action";
    button.disabled = true;
    button.textContent = label;
    button.title = "Vorschau – diese Aktion ist hier deaktiviert.";
    actions.appendChild(button);
  }
  return actions;
}

async function loadRegionName(profile) {
  if (!profile?.home_region_id) return "";
  const { data } = await supabase.from("regions").select("name").eq("id", profile.home_region_id).maybeSingle();
  return data?.name || "";
}

async function applyCoverContrast(card, imageUrl) {
  if (!card || !imageUrl) return;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    image.src = imageUrl;
    await loaded;
    const canvas = document.createElement("canvas");
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let luminance = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;
      luminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count += 1;
    }
    const avg = count ? luminance / count : 0.5;
    card.classList.toggle("is-cover-light", avg > 0.58);
    card.classList.toggle("is-cover-dark", avg <= 0.58);
  } catch {
    card.classList.add("is-cover-dark");
  }
}

async function buildExactPreview(page) {
  if (!(page instanceof HTMLElement) || page.dataset.previewParityLoading === "1" || page.dataset.previewParityReady === "1") return;
  const profileId = page.dataset.profileId;
  const hero = page.querySelector(":scope > .member-profile-hero");
  if (!profileId || !hero || !supabase) return;

  page.dataset.previewParityLoading = "1";
  try {
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", profileId).single();
    if (error) throw error;
    if (!page.isConnected || page.dataset.profileId !== profileId) return;

    const regionName = await loadRegionName(profile);
    const role = roleInfo(profile);
    const avatar = hero.querySelector(":scope > img:not(.profile-bio-image)");

    page.classList.add("ec-profile-preview-parity", "ec-member-profile-final");
    ensurePreviewBanner(page);
    page.querySelectorAll(":scope > .ec-mp-card,:scope > .ec-mp-actions").forEach((node) => node.remove());

    const card = document.createElement("section");
    card.className = "ec-mp-card";
    if (String(profile.profile_background || "").startsWith("http")) {
      card.classList.add("has-profile-cover");
      const cover = document.createElement("div");
      cover.className = "ec-mp-cover";
      const coverImage = document.createElement("img");
      coverImage.src = profile.profile_background;
      coverImage.alt = "";
      coverImage.loading = "eager";
      const coverX = Number(profile.profile_background_position_x ?? 50);
      const coverY = Number(profile.profile_background_position_y ?? 50);
      const coverZoom = Number(profile.profile_background_zoom ?? 1);
      const coverPanX = (coverX - 50) * 0.16;
      const coverPanY = (coverY - 50) * 0.16;
      coverImage.style.objectPosition = "50% 50%";
      coverImage.style.transform = `translate(${coverPanX}%, ${coverPanY}%) scale(${coverZoom})`;
      coverImage.style.transformOrigin = "50% 50%";
      const coverShade = document.createElement("span");
      coverShade.className = "ec-mp-cover-shade";
      coverShade.style.setProperty("--ec-cover-overlay", String(Number(profile.profile_background_overlay ?? 0.18)));
      cover.append(coverImage, coverShade);
      card.appendChild(cover);
      void applyCoverContrast(card, profile.profile_background);
    }

    const left = document.createElement("div");
    left.className = "ec-mp-left";
    const photo = document.createElement("div");
    photo.className = "ec-mp-photo";
    if (avatar) photo.appendChild(avatar);
    left.appendChild(photo);

    const functionBox = document.createElement("div");
    functionBox.className = "ec-mp-function";
    functionBox.innerHTML = `<span>Funktion</span><span class="ec-mp-function-role">${role.star ? `<img class="ec-mp-role-star" src="${role.star}" alt="" aria-hidden="true">` : ""}<strong>${esc(role.label)}</strong></span>`;
    left.appendChild(functionBox);

    const data = document.createElement("div");
    data.className = "ec-mp-data";
    const realName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    const nickname = profile.nickname || realName || "Mitglied";
    data.innerHTML = `<div class="ec-mp-data-head"><div><span>MITGLIEDSPROFIL</span><h1>${esc(nickname)}</h1></div>${profile.is_verified ? '<b class="ec-mp-verified" title="Verifiziert">✓</b>' : ""}</div><div class="ec-mp-rows">${row("Nickname", profile.nickname)}${isPublic(profile, "name") ? row("Vorname", profile.first_name) : ""}${isPublic(profile, "name") ? row("Nachname", profile.last_name) : ""}${isPublic(profile, "birth_date") ? row("Geburtsdatum", formatDate(profile.birth_date)) : ""}${isPublic(profile, "birth_date") ? row("Alter", formatAge(profile.birth_date)) : ""}${row("Heimatregion", regionName)}</div>`;

    card.append(left, data);
    hero.insertAdjacentElement("beforebegin", card);
    hero.hidden = true;

    const sourceActions = page.querySelector(":scope > .member-profile-actions");
    if (sourceActions) sourceActions.hidden = true;
    const actions = buildPreviewActions(profile);
    card.insertAdjacentElement("afterend", actions);

    page.querySelectorAll(":scope > .eyebrow, :scope > .eyebrow + p").forEach((node) => { node.hidden = true; });
    page.dataset.previewParityReady = "1";
  } catch (error) {
    console.warn("Profilvorschau konnte nicht als echte Mitgliederansicht aufgebaut werden:", error?.message || error);
  } finally {
    if (page.isConnected) delete page.dataset.previewParityLoading;
  }
}

function scan() {
  document.querySelectorAll(PREVIEW_SELECTOR).forEach((page) => void buildExactPreview(page));
}

const observer = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE && (node.matches?.(PREVIEW_SELECTOR) || node.querySelector?.(PREVIEW_SELECTOR))))) scan();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("ec:navigate", scan);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
else scan();
