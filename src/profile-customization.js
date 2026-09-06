import { supabase } from "./supabaseClient";

const REWARD_LAYOUTS = [
  ["standard", "Standard – Ennstal", 0],
  ["alpine", "Alpen – Berggrün", 2],
  ["aurora", "Aurora – Violett", 5],
  ["ocean", "Ozean – Tiefblau", 10],
  ["slate", "Schiefer – Anthrazit", 15],
  ["ember", "Ember – Warmes Orange", 20],
  ["redwood", "Bergrot – Alpinrot", 25],
  ["lavender", "Lavendel – Sanftes Violett", 30],
  ["midnight", "Mitternacht – Nachtblau", 35],
  ["sunrise", "Sonnenaufgang – Goldrosa", 40],
  ["neon", "Neon Connect – Leuchtfarben", 50]
];

const OLD_LAYOUT_HOURS = {
  standard: 0,
  alpine: 5,
  aurora: 20,
  ocean: 35,
  slate: 50,
  ember: 70,
  redwood: 90,
  lavender: 110,
  midnight: 130,
  sunrise: 150,
  neon: 180
};

const NEW_LAYOUT_HOURS = Object.fromEntries(REWARD_LAYOUTS.map(([value, , hours]) => [value, hours]));
const REWARD_SIGNATURE = REWARD_LAYOUTS.map(([value, , hours]) => `${value}:${hours}`).join("|");
const SUPPORT_EMAIL = "ennstal.connect@gmx.at";
let applyingEnhancements = false;
let enhancementQueued = false;
let supportPanelLoading = false;
let supportPanelSubscribed = false;

function onlineHoursFrom(section) {
  const match = section?.textContent?.match(/Onlinezeit:\s*(\d+)\s*Stunden/i);
  return match ? Number(match[1]) : null;
}

function enhanceProfileRewards() {
  const select = document.querySelector('select[name="profile_layout"]');
  if (!select) return;
  const section = select.closest(".layout-rewards");
  if (!section) return;

  const hours = onlineHoursFrom(section);
  const freeLayouts = hours === null;
  const stateSignature = `${REWARD_SIGNATURE}|hours:${hours ?? "free"}`;
  if (section.dataset.rewardSignature === stateSignature) return;

  const currentValue = select.value || "standard";
  const fragment = document.createDocumentFragment();
  REWARD_LAYOUTS.forEach(([value, label, requiredHours]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `${label}${freeLayouts || hours >= requiredHours ? "" : ` · ab ${requiredHours} Stunden`}`;
    option.disabled = !freeLayouts && hours < requiredHours;
    fragment.appendChild(option);
  });
  select.replaceChildren(fragment);
  select.value = currentValue;

  const paragraph = section.querySelector("p");
  if (paragraph && hours !== null) {
    const nextText = `Onlinezeit: ${hours} Stunden · Neue Designs werden schneller freigeschaltet. Neon Connect ist ab 50 Stunden verfügbar.`;
    if (paragraph.textContent !== nextText) paragraph.textContent = nextText;
  }
  section.dataset.rewardSignature = stateSignature;
}

function fixRewardCopy(root = document) {
  root.querySelectorAll("p,span,small,div").forEach((node) => {
    if (node.children.length) return;
    const text = node.textContent || "";
    if (!/180\s*Stunden/i.test(text)) return;
    const next = text.replace(/180\s*Stunden/gi, "50 Stunden");
    if (next !== text) node.textContent = next;
  });
}

function ensureAuthRewardBanner() {
  const welcome = document.querySelector(".auth-welcome");
  if (!welcome || welcome.querySelector(".ec-auth-reward-banner")) return;

  const banner = document.createElement("aside");
  banner.className = "ec-auth-reward-banner";
  banner.innerHTML = `
    <div class="ec-auth-reward-icon">♕</div>
    <div class="ec-auth-reward-copy">
      <strong>Aktiv sein lohnt sich!</strong>
      <span>Mit deinen Online-Stunden schaltest du besondere Profildesigns frei – <b>Neon Connect bereits ab 50 Stunden.</b></span>
      <small>Supporter und offizielle Unterstützer der Community können alle Layouts sofort verwenden.</small>
    </div>
    <button type="button" class="ec-auth-reward-action">Alle Belohnungen ansehen</button>
  `;
  banner.querySelector("button")?.addEventListener("click", () => {
    const rewardCard = [...document.querySelectorAll(".auth-intro *, .auth-welcome *")]
      .find((node) => /Aktiv sein lohnt sich/i.test(node.textContent || "") && node !== banner && !banner.contains(node));
    rewardCard?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  welcome.prepend(banner);
}

function enhanceAuthPage() {
  const list = document.querySelector(".auth-feature-list");
  if (list && !list.querySelector("[data-auth-rewards]")) {
    const reward = document.createElement("div");
    reward.dataset.authRewards = "true";
    reward.innerHTML = "<b>🎨 Schnellere Profil-Belohnungen</b><span>Neue Community-Layouts werden schon nach wenigen Online-Stunden freigeschaltet. Neon Connect gibt es bereits ab 50 Stunden.</span>";
    list.appendChild(reward);
  }
  ensureAuthRewardBanner();
  fixRewardCopy(document.querySelector(".auth-welcome") || document);
}

function enhanceHeadAdminOperatorLabel() {
  document.querySelectorAll(".member-profile-hero.head-admin .admin-responsibilities").forEach((box) => {
    if (box.dataset.operatorLabel === "true") return;
    const current = String(box.textContent || "").trim();
    const detail = current.replace(/^Zuständig\s+für:\s*/i, "").trim();
    if (!detail) return;

    const title = document.createElement("strong");
    title.className = "operator-responsibility-title";
    title.textContent = "♛ Betreiber";
    const text = document.createElement("span");
    text.className = "operator-responsibility-text";
    text.textContent = detail;
    box.replaceChildren(title, text);
    box.classList.add("operator-responsibilities");
    box.dataset.operatorLabel = "true";
  });
}

function profileRole(profile) {
  return String(profile?.role || "").toUpperCase();
}

function contactRoleLabel(profile) {
  const role = profileRole(profile);
  if (role === "HEAD_ADMIN" || role.includes("HEAD")) return "Betreiber";
  if (role.includes("ADMIN")) return "Admin";
  if (role.includes("SUPPORTER")) return "Supporter";
  return role || "Team";
}

function contactName(profile) {
  return profile?.display_name || profile?.full_name || profile?.name || profile?.nickname || profile?.username || "Community-Team";
}

function contactAvatar(profile) {
  return profile?.avatar_url || profile?.profile_image || profile?.profile_image_url || profile?.photo_url || "";
}

function contactResponsibilities(profile) {
  const role = profileRole(profile);
  if (role === "HEAD_ADMIN" || role.includes("HEAD")) {
    return profile?.head_admin_responsibilities || profile?.admin_responsibilities || "Datenschutz, Technischer Betrieb, Sicherheit und Community-Verwaltung.";
  }
  if (role.includes("ADMIN")) return profile?.admin_responsibilities || "Administration und Community-Betreuung.";
  return profile?.supporter_responsibilities || profile?.admin_responsibilities || "Support und Community-Betreuung.";
}

function findAdministrationCard() {
  const heading = [...document.querySelectorAll("h1,h2,h3,h4")].find((node) => /^Administration(?:\s*&\s*Support)?$/i.test(String(node.textContent || "").trim()));
  if (!heading) return null;
  return heading.closest("section,article,.card,.dashboard-card,.home-card,.panel") || heading.parentElement;
}

function ensureSupportPanelStyles() {
  if (document.getElementById("ec-support-panel-styles")) return;
  const style = document.createElement("style");
  style.id = "ec-support-panel-styles";
  style.textContent = `
    .ec-support-panel{margin-top:14px;border:1px solid #b8dcf4;border-radius:16px;background:linear-gradient(145deg,#fff,#f5fbff);box-shadow:0 8px 22px rgba(30,93,145,.10);overflow:hidden}
    .ec-support-info{padding:15px 16px;border-bottom:1px solid #dbeaf4}
    .ec-support-info strong{display:block;color:#1f334b;font-size:16px;margin-bottom:5px}
    .ec-support-info p{margin:4px 0;color:#4a627c;line-height:1.4}
    .ec-support-email{display:inline-block;margin-top:5px;color:#0879e8;font-weight:800;text-decoration:none}
    .ec-contact-person{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:start;padding:14px 16px;border-bottom:1px solid #e1edf5}
    .ec-contact-person:last-child{border-bottom:0}
    .ec-contact-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;background:#e8f0f6;border:2px solid #d6e5ef}
    .ec-contact-avatar-fallback{display:grid;place-items:center;font-weight:900;color:#34526d}
    .ec-contact-name{font-weight:900;color:#c87500;font-size:17px}
    .ec-contact-role{font-weight:800;color:#27845c;margin:2px 0}
    .ec-contact-responsibility{color:#536c84;line-height:1.35;font-size:14px}
    .ec-contact-badge{background:#d8edff;color:#0b6fc6;border-radius:999px;padding:4px 9px;font-weight:800;font-size:12px;white-space:nowrap}
    .ec-support-empty{padding:14px 16px;color:#60758a}
    @media(max-width:520px){.ec-contact-person{grid-template-columns:42px minmax(0,1fr)}.ec-contact-avatar{width:42px;height:42px}.ec-contact-badge{grid-column:2;justify-self:start}}
  `;
  document.head.appendChild(style);
}

function renderSupportContacts(card, profiles) {
  ensureSupportPanelStyles();
  const heading = [...card.querySelectorAll("h1,h2,h3,h4")].find((node) => /^Administration(?:\s*&\s*Support)?$/i.test(String(node.textContent || "").trim()));
  if (!heading) return;
  heading.textContent = "Administration & Support";

  let panel = card.querySelector(".ec-support-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "ec-support-panel";
    const oldRows = [...card.children].filter((child) => child !== heading && child !== panel && !child.classList?.contains("eyebrow"));
    oldRows.forEach((child) => {
      if (/Marco|Roland|Zuständig|Nachrichten verwalten|Profilbesuche|Community-Verwaltung/i.test(child.textContent || "")) child.remove();
    });
    heading.insertAdjacentElement("afterend", panel);
  }

  panel.innerHTML = `
    <div class="ec-support-info">
      <strong>✉ Support für alle Anfragen</strong>
      <p>Für sämtliche Support-Anfragen sind entweder ich persönlich über eine private Nachricht oder die unten angeführten Admins bzw. Supporter zuständig.</p>
      <a class="ec-support-email" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </div>
    <div class="ec-support-people"></div>
  `;

  const people = panel.querySelector(".ec-support-people");
  if (!profiles.length) {
    people.innerHTML = '<div class="ec-support-empty">Derzeit sind keine Admins oder Supporter eingetragen.</div>';
    return;
  }

  profiles.forEach((profile) => {
    const row = document.createElement("div");
    row.className = "ec-contact-person";
    const avatar = contactAvatar(profile);
    const avatarHtml = avatar
      ? `<img class="ec-contact-avatar" src="${avatar}" alt="">`
      : `<div class="ec-contact-avatar ec-contact-avatar-fallback">${contactName(profile).slice(0, 1).toUpperCase()}</div>`;
    row.innerHTML = `
      ${avatarHtml}
      <div>
        <div class="ec-contact-name">${contactName(profile)}</div>
        <div class="ec-contact-role">${contactRoleLabel(profile)}</div>
        <div class="ec-contact-responsibility">${contactResponsibilities(profile)}</div>
      </div>
      <span class="ec-contact-badge">${contactRoleLabel(profile)}</span>
    `;
    people.appendChild(row);
  });
}

async function refreshSupportContacts() {
  if (!supabase || supportPanelLoading) return;
  const card = findAdministrationCard();
  if (!card) return;
  supportPanelLoading = true;
  try {
    const { data, error } = await supabase.from("profiles").select("*");
    if (error) throw error;
    const profiles = (data || [])
      .filter((profile) => {
        const role = profileRole(profile);
        return role.includes("ADMIN") || role.includes("SUPPORTER");
      })
      .sort((a, b) => {
        const rank = (profile) => profileRole(profile).includes("HEAD") ? 0 : profileRole(profile).includes("ADMIN") ? 1 : 2;
        return rank(a) - rank(b) || contactName(a).localeCompare(contactName(b), "de");
      });
    renderSupportContacts(card, profiles);
  } catch (error) {
    console.error("Ansprechpartner konnten nicht synchronisiert werden:", error);
  } finally {
    supportPanelLoading = false;
  }

  if (!supportPanelSubscribed) {
    supportPanelSubscribed = true;
    supabase.channel("ec-support-contacts")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refreshSupportContacts())
      .subscribe();
  }
}

function enhanceOwnProfileCustomization() {
  const form = document.querySelector(".profile-form");
  const card = document.querySelector(".my-profile-card");
  if (!form || !card || form.dataset.fullCustomization === "true") return;

  const accent = form.querySelector('[name="profile_accent"]');
  const backgroundColor = form.querySelector('[name="profile_background_color"]');
  const backgroundImage = form.querySelector('[name="profile_background_image"]');
  const bioColor = form.querySelector('[name="bio_color"]');
  const bioFont = form.querySelector('[name="bio_font"]');
  const bioSize = form.querySelector('[name="bio_size"]');
  const bio = card.querySelector(".profile-bio");

  const panel = document.createElement("section");
  panel.className = "profile-full-customization";
  panel.innerHTML = `
    <span class="eyebrow">KOMPLETTE PROFILGESTALTUNG</span>
    <h3>Dein Profil, dein Design</h3>
    <p>Profilbild, Hintergrund, Akzentfarbe, Layout, Schrift, Textfarbe und Sichtbarkeit kannst du selbst gestalten. Änderungen an Farben und Schrift siehst du sofort in der Vorschau.</p>
    <div class="profile-customization-actions">
      <button type="button" class="secondary-button" data-remove-background>Hintergrundbild entfernen</button>
      <button type="button" class="secondary-button" data-reset-design>Standardfarben</button>
    </div>
  `;
  form.querySelector(".primary-button")?.before(panel);

  const applyPreview = () => {
    if (accent?.value) {
      card.style.setProperty("--profile-accent", accent.value);
      card.style.borderColor = accent.value;
      card.style.boxShadow = `0 18px 42px color-mix(in srgb, ${accent.value} 28%, transparent)`;
    }
    if (backgroundColor?.value && !backgroundImage?.value) {
      card.style.backgroundImage = "none";
      card.style.backgroundColor = backgroundColor.value;
    }
    if (bio && bioColor?.value) bio.style.color = bioColor.value;
    if (bio && bioFont?.value) {
      bio.classList.remove("modern", "serif", "handwritten");
      bio.classList.add(bioFont.value);
    }
    if (bio && bioSize?.value) {
      bio.classList.remove("small", "normal", "large");
      bio.classList.add(bioSize.value);
    }
  };

  [accent, backgroundColor, bioColor, bioFont, bioSize].filter(Boolean).forEach((control) => {
    control.addEventListener("input", applyPreview);
    control.addEventListener("change", applyPreview);
  });

  panel.querySelector("[data-remove-background]")?.addEventListener("click", () => {
    if (backgroundImage) backgroundImage.value = "";
    card.style.backgroundImage = "none";
    if (backgroundColor?.value) card.style.backgroundColor = backgroundColor.value;
  });

  panel.querySelector("[data-reset-design]")?.addEventListener("click", () => {
    if (accent) accent.value = "#ff6b25";
    if (backgroundColor) backgroundColor.value = "#1b1f26";
    if (bioColor) bioColor.value = "#f1f5f9";
    if (bioFont) bioFont.value = "modern";
    if (bioSize) bioSize.value = "normal";
    if (backgroundImage) backgroundImage.value = "";
    applyPreview();
  });

  form.dataset.fullCustomization = "true";
  applyPreview();
}

async function saveNewlyUnlockedLayout(layout) {
  if (!supabase) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  const { error } = await supabase.from("profiles").update({ profile_layout: layout }).eq("id", user.id);
  if (error) {
    console.error("Neues Profil-Layout konnte nicht gespeichert werden:", error);
    return;
  }
  const select = document.querySelector('select[name="profile_layout"]');
  if (select) select.value = layout;
}

function handleProfileSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const select = form.querySelector('select[name="profile_layout"]');
  if (!select) return;

  const section = select.closest(".layout-rewards");
  const hours = onlineHoursFrom(section);
  if (hours === null) return;

  const requested = select.value;
  const newRequired = NEW_LAYOUT_HOURS[requested] ?? 0;
  const oldRequired = OLD_LAYOUT_HOURS[requested] ?? 0;
  if (hours < newRequired || hours >= oldRequired) return;

  const fallback = [...REWARD_LAYOUTS]
    .map(([value]) => value)
    .filter((value) => (OLD_LAYOUT_HOURS[value] ?? 0) <= hours)
    .pop() || "standard";

  select.value = fallback;
  window.setTimeout(() => saveNewlyUnlockedLayout(requested), 1200);
}

function applyEnhancements() {
  if (applyingEnhancements) return;
  applyingEnhancements = true;
  try {
    enhanceProfileRewards();
    enhanceAuthPage();
    enhanceHeadAdminOperatorLabel();
    enhanceOwnProfileCustomization();
    refreshSupportContacts();
    fixRewardCopy();
  } finally {
    applyingEnhancements = false;
  }
}

function queueEnhancements() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  window.requestAnimationFrame(() => {
    enhancementQueued = false;
    applyEnhancements();
  });
}

document.addEventListener("submit", handleProfileSubmit, true);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyEnhancements, { once: true });
} else {
  applyEnhancements();
}

const observer = new MutationObserver((mutations) => {
  if (applyingEnhancements) return;
  const relevant = mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length);
  if (relevant) queueEnhancements();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
