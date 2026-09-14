const HOME_ENHANCEMENT_ID = "ec-multi-region-home-intro";
const ACTIVATION_ID = "ec-home-activation";

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

function bindNavigation(section, selector, page) {
  section.querySelectorAll(selector).forEach((button) => button.addEventListener("click", () => navigateTo(page)));
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
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="members"><span>🤝</span><strong>Menschen kennenlernen</strong><small>Kontakte aus deiner Region finden und regional vernetzt bleiben.</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="community"><span>💼</span><strong>Jobs &amp; Business</strong><small>Unternehmen, Kooperationen und regionale Möglichkeiten entdecken.</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="events"><span>🎉</span><strong>Events &amp; Freizeit</strong><small>Sehen, was in deiner Region passiert, und gemeinsam aktiv werden.</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="forum"><span>💡</span><strong>Empfehlungen &amp; Hilfe</strong><small>Fragen stellen, Erfahrungen teilen und schnelle regionale Hilfe finden.</small></button>
    </div>`;

  section.querySelector('[data-ec-home-action="region"]')?.addEventListener("click", openRegionPicker);
  bindNavigation(section, '[data-ec-home-action="community"]', 'community');
  bindNavigation(section, '[data-ec-home-action="members"]', 'members');
  bindNavigation(section, '[data-ec-home-action="events"]', 'events');
  bindNavigation(section, '[data-ec-home-action="forum"]', 'forum');
  return section;
}

function buildActivation(regionName) {
  const section = document.createElement("section");
  section.id = ACTIVATION_ID;
  section.className = "ec-home-activation";
  section.innerHTML = `
    <section class="ec-first-steps">
      <div class="ec-first-steps-head"><div><span class="eyebrow">DEINE ERSTEN SCHRITTE</span><h2>Mach aus deinem Konto deine Community.</h2><p>Drei einfache Aktionen bringen dich schneller zu den richtigen Menschen und Themen.</p></div><span class="ec-first-steps-badge">3 Schritte</span></div>
      <div class="ec-first-steps-grid">
        <button type="button" data-ec-activation="profile"><span>1</span><div><strong>Profil ergänzen</strong><small>Wohnort, Interessen und ein paar Worte über dich.</small></div></button>
        <button type="button" data-ec-activation="groups"><span>2</span><div><strong>Gruppe finden</strong><small>Entdecke Menschen mit gemeinsamen Interessen.</small></div></button>
        <button type="button" data-ec-activation="forum"><span>3</span><div><strong>Kurz vorstellen</strong><small>Starte deinen ersten Beitrag und sag kurz Servus.</small></div></button>
      </div>
    </section>

    <section class="ec-today-region">
      <div class="ec-today-region-head"><div><span class="eyebrow">HEUTE IN DEINER REGION</span><h2>Was passiert gerade in ${escapeHtml(regionName)}?</h2></div><button type="button" data-ec-activation="region">Region wechseln</button></div>
      <div class="ec-today-region-grid">
        <button type="button" data-ec-activation="members"><span>🤝</span><strong>Menschen</strong><small>Mitglieder aus ${escapeHtml(regionName)} entdecken.</small><em>Jetzt ansehen →</em></button>
        <button type="button" data-ec-activation="events"><span>🎉</span><strong>Was ist los?</strong><small>Events und gemeinsame Aktivitäten finden.</small><em>Events entdecken →</em></button>
        <button type="button" data-ec-activation="community"><span>🔎</span><strong>Gesucht &amp; gefunden</strong><small>Hilfe, Empfehlungen und regionale Kontakte.</small><em>Community öffnen →</em></button>
        <button type="button" data-ec-activation="forum"><span>💬</span><strong>Diskussion</strong><small>Fragen stellen und bei regionalen Themen mitreden.</small><em>Mitreden →</em></button>
      </div>
    </section>

    <section class="ec-introduce-nudge"><div><span class="eyebrow">NEU HIER?</span><h2>Ein „Servus“ reicht für den Anfang.</h2><p>Stell dich kurz vor und gib anderen einen einfachen Anlass, mit dir ins Gespräch zu kommen.</p></div><button type="button" class="primary-button" data-ec-activation="forum">👋 Kurz vorstellen</button></section>`;

  section.querySelector('[data-ec-activation="region"]')?.addEventListener('click', openRegionPicker);
  for (const page of ['profile', 'groups', 'members', 'events', 'community', 'forum']) {
    bindNavigation(section, `[data-ec-activation="${page}"]`, page);
  }
  return section;
}

function syncHomeIntro() {
  const home = document.querySelector(".home-page");
  if (!home) {
    document.getElementById(HOME_ENHANCEMENT_ID)?.remove();
    document.getElementById(ACTIVATION_ID)?.remove();
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

  let activation = document.getElementById(ACTIVATION_ID);
  if (!activation) {
    activation = buildActivation(regionName);
    intro.after(activation);
  } else {
    const heading = activation.querySelector('.ec-today-region-head h2');
    if (heading) heading.textContent = `Was passiert gerade in ${regionName}?`;
    const people = activation.querySelector('[data-ec-activation="members"] small');
    if (people) people.textContent = `Mitglieder aus ${regionName} entdecken.`;
  }
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
