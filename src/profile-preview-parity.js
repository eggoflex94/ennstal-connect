import { supabase } from "./supabaseClient";
import "./profile-preview-parity.css";

const PREVIEW_SELECTOR = ".public-profile-preview";

function roleClass(role) {
  return String(role || "MEMBER").toLowerCase().replace("_", "-");
}

function ensurePreviewBanner(page) {
  if (page.querySelector(":scope > .ec-profile-preview-banner")) return;
  const backButton = page.querySelector(":scope > .back-button");
  const banner = document.createElement("div");
  banner.className = "ec-profile-preview-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = "<strong>Ansicht für andere Mitglieder</strong><span>Diese Vorschau verwendet dieselbe Profil-Darstellung wie ein nicht befreundetes Mitglied.</span>";
  if (backButton?.nextSibling) page.insertBefore(banner, backButton.nextSibling);
  else page.prepend(banner);
}

function ensureMemberActions(page, role) {
  const hero = page.querySelector(":scope > .member-profile-hero");
  if (!hero || page.querySelector(":scope > .ec-preview-member-actions")) return;

  const actions = document.createElement("div");
  actions.className = "member-profile-actions ec-preview-member-actions";
  const buttons = [
    ["primary-button", "💬 Nachricht"],
    ["secondary-button", "🤝 Freundschaftsanfrage"],
    ...(["ADMIN", "HEAD_ADMIN"].includes(String(role || "").toUpperCase()) ? [] : [["secondary-button", "🚫 Blockieren"]]),
    ["danger-button", "🚩 Nutzer melden"],
  ];
  for (const [className, label] of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.disabled = true;
    button.textContent = label;
    button.title = "Nur Vorschau – Aktionen sind hier deaktiviert.";
    actions.appendChild(button);
  }
  hero.insertAdjacentElement("afterend", actions);
}

function applyRealMemberHero(page, profile) {
  const hero = page.querySelector(":scope > .member-profile-hero");
  if (!hero) return;

  hero.classList.remove("ec-preview-admin", "ec-preview-supporter", "ec-preview-business", "ec-preview-member");
  hero.classList.add(roleClass(profile?.role));
  hero.classList.toggle("business-profile", profile?.account_badge === "BUSINESS");

  if (profile?.profile_background?.startsWith("http")) {
    hero.style.backgroundImage = `linear-gradient(rgba(20,37,54,.68), rgba(20,37,54,.86)), url(${profile.profile_background})`;
    hero.style.backgroundSize = "cover";
    hero.style.backgroundPosition = "center";
  } else {
    hero.style.removeProperty("background-image");
    hero.style.removeProperty("background-size");
    hero.style.removeProperty("background-position");
  }
}

async function syncPreview(page) {
  if (!(page instanceof HTMLElement) || page.dataset.previewParityLoading === "1") return;
  page.classList.add("ec-profile-preview-parity");
  ensurePreviewBanner(page);

  const profileId = page.dataset.profileId;
  if (!profileId || !supabase) return;

  page.dataset.previewParityLoading = "1";
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,role,account_badge,profile_background")
      .eq("id", profileId)
      .single();
    if (error) throw error;
    if (!page.isConnected || page.dataset.profileId !== profileId) return;
    applyRealMemberHero(page, data);
    ensureMemberActions(page, data?.role);
    page.dataset.previewParityReady = "1";
  } catch (error) {
    console.warn("Profilvorschau konnte nicht vollständig synchronisiert werden:", error?.message || error);
  } finally {
    if (page.isConnected) delete page.dataset.previewParityLoading;
  }
}

function scan() {
  document.querySelectorAll(PREVIEW_SELECTOR).forEach((page) => void syncPreview(page));
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan, { once: true });
else scan();
