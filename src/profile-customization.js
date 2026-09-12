/* Profile customization helpers only.
   Layout rewards are owned by standard-theme-runtime.js so legacy layouts
   cannot overwrite Standard / Connect Rot / Connect Blau anymore.
   This module is event-driven: no full-page MutationObserver. */

let applyingEnhancements = false;
let enhancementQueued = false;
let retryTimers = [];

function enhanceHeadAdminOperatorLabel() {
  document.querySelectorAll(".member-profile-hero.head-admin .admin-responsibilities").forEach((box) => {
    const current = String(box.textContent || "").trim();
    const detail = current
      .replace(/^♛?\s*Betreiber\s*[·:|\-]?\s*/i, "")
      .replace(/^Zuständig\s+für:\s*/i, "")
      .trim();
    if (!detail) return;
    const nextText = `♛ Betreiber · ${detail}`;
    if (current !== nextText) box.textContent = nextText;
    box.classList.add("operator-responsibilities");
    box.dataset.operatorLabel = "true";
  });
}

function enhanceOwnProfileCustomization() {
  const form = document.querySelector(".profile-form");
  const card = document.querySelector(".my-profile-card");
  if (!form || !card || form.dataset.fullCustomization === "true") return false;

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
    if (!card.isConnected) return;
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
  return true;
}

function applyEnhancements() {
  if (applyingEnhancements) return false;
  applyingEnhancements = true;
  try {
    enhanceHeadAdminOperatorLabel();
    return enhanceOwnProfileCustomization();
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

function scheduleProfileMounts() {
  retryTimers.forEach(clearTimeout);
  retryTimers = [0, 100, 300, 700, 1400].map((delay) => setTimeout(queueEnhancements, delay));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleProfileMounts, { once: true });
} else {
  scheduleProfileMounts();
}
window.addEventListener("ec:navigate", scheduleProfileMounts);
window.addEventListener("focus", () => queueEnhancements());
