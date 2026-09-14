const HOME_ENHANCEMENT_ID = "ec-multi-region-home-intro";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

function getActiveRegionName() {
  const shellRegion = document.querySelector(".ec-active-region-name")?.textContent?.trim();
  if (shellRegion && shellRegion !== "Region") return shellRegion;

  const heading = document.querySelector(".home-page .page-heading .eyebrow")?.textContent?.trim() || "";
  const match = heading.match(/^REGION\s+(.+)$/i);
  return match?.[1]?.trim() || "deiner Region";
}

function openRegionPicker() {
  const picker = document.querySelector(".ec-region-picker select");
  if (!picker) return;
  picker.focus({ preventScroll: false });
  picker.scrollIntoView({ behavior: "smooth", block: "center" });
}

function navigateTo(page) {
  window.dispatchEvent(new CustomEvent("ec:navigate", { detail: { page } }));
}

function buildHomeIntro(regionName) {
  const section = document.createElement("section");
  section.id = HOME_ENHANCEMENT_ID;
  section.className = "ec-multi-region-home-intro";
  section.setAttribute("aria-label", "Ennstal Connect Regionen und Möglichkeiten");
  section.innerHTML = `
    <div class="ec-multi-region-hero">
      <div class="ec-multi-region-copy">
        <span class="ec-multi-region-kicker">EINE COMMUNITY · MEHRERE REGIONEN</span>
        <h2>Gemeinsam stärker. Regional verbunden.</h2>
        <p>Ennstal Connect verbindet Menschen, Unternehmen und Chancen in deiner Region. Du entscheidest selbst, welche Region für dich gerade relevant ist.</p>
        <div class="ec-multi-region-actions">
          <button type="button" class="primary-button" data-ec-home-action="community">Community entdecken</button>
          <button type="button" class="secondary-button" data-ec-home-action="region">Region wechseln</button>
        </div>
      </div>
      <div class="ec-multi-region-current" aria-label="Aktive Region">
        <span>Du bist gerade in</span>
        <strong>${escapeHtml(regionName)}</strong>
        <small>Beiträge und regionale Inhalte bleiben auf deine ausgewählte Region abgestimmt.</small>
      </div>
    </div>

    <div class="ec-multi-region-benefits" aria-label="Vorteile von Ennstal Connect">
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="members">
        <span aria-hidden="true">🤝</span>
        <strong>Menschen kennenlernen</strong>
        <small>Kontakte aus deiner Region finden und regional vernetzt bleiben.</small>
      </button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="community">
        <span aria-hidden="true">💼</span>
        <strong>Jobs &amp; Business</strong>
        <small>Unternehmen, Kooperationen und regionale Möglichkeiten entdecken.</small>
      </button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="events">
        <span aria-hidden="true">🎉</span>
        <strong>Events &amp; Freizeit</strong>
        <small>Sehen, was in deiner Region passiert, und gemeinsam aktiv werden.</small>
      </button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="forum">
        <span aria-hidden="true">💡</span>
        <strong>Empfehlungen &amp; Hilfe</strong>
        <small>Fragen stellen, Erfahrungen teilen und schnelle regionale Hilfe finden.</small>
      </button>
    </div>
  `;

  section.querySelector('[data-ec-home-action="region"]')?.addEventListener("click", openRegionPicker);
  for (const page of ["community", "members", "events", "forum"]) {
    section.querySelectorAll(`[data-ec-home-action="${page}"]`).forEach((button) => {
      button.addEventListener("click", () => navigateTo(page));
    });
  }
  return section;
}

function syncHomeIntro() {
  const home = document.querySelector(".home-page");
  if (!home) {
    document.getElementById(HOME_ENHANCEMENT_ID)?.remove();
    return;
  }

  const regionName = getActiveRegionName();
  let intro = document.getElementById(HOME_ENHANCEMENT_ID);
  if (!intro) {
    intro = buildHomeIntro(regionName);
    const heading = home.querySelector(":scope > .page-heading");
    if (heading) heading.after(intro);
    else home.prepend(intro);
  }

  const regionLabel = intro.querySelector(".ec-multi-region-current strong");
  if (regionLabel && regionLabel.textContent !== regionName) regionLabel.textContent = regionName;
}

let queued = false;
const queueSync = () => {
  if (queued) return;
  queued = true;
  window.requestAnimationFrame(() => {
    queued = false;
    syncHomeIntro();
  });
};

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("ec:region-change", queueSync);
window.addEventListener("ec:navigate", queueSync);
window.addEventListener("popstate", queueSync);

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueSync, { once: true });
else queueSync();
