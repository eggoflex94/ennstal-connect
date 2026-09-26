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
  section.className = "ec-multi-region-home-intro ec-region-hub-intro";
  section.setAttribute("aria-label", "Regionale Startseite");
  section.innerHTML = `
    <div class="ec-multi-region-hero ec-region-hub-hero">
      <div class="ec-multi-region-copy">
        <span class="ec-multi-region-kicker">DEINE REGION</span>
        <h2>${escapeHtml(regionName)}</h2>
        <p>Was heute wichtig ist, wer gerade aktiv ist und wo du direkt mitmachen kannst.</p>
        <div class="ec-multi-region-actions">
          <button type="button" class="primary-button" data-ec-home-action="community">Community öffnen</button>
          <button type="button" class="secondary-button" data-ec-home-action="region">Region wechseln</button>
        </div>
      </div>
      <div class="ec-multi-region-current" aria-label="Aktive Region">
        <span>AKTIVE REGION</span>
        <strong>${escapeHtml(regionName)}</strong>
        <small>Alle regionalen Inhalte, Gruppen, Events und Hinweise werden auf diese Region abgestimmt.</small>
      </div>
    </div>

    <nav class="ec-multi-region-benefits ec-region-hub-nav" aria-label="Regionale Bereiche">
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="events"><span>🎉</span><strong>Heute &amp; demnächst</strong><small>Events und Termine</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="community"><span>🤝</span><strong>Gesucht &amp; angeboten</strong><small>Hilfe und Community-Aufrufe</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="members"><span>👋</span><strong>Menschen &amp; Gruppen</strong><small>Regional vernetzen</small></button>
      <button type="button" class="ec-multi-region-benefit" data-ec-home-action="forum"><span>💬</span><strong>Aus der Region</strong><small>Forum und Austausch</small></button>
    </nav>`;

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
  section.className = "ec-home-activation ec-region-hub-activation";
  section.innerHTML = `
    <section class="ec-today-region">
      <div class="ec-today-region-head"><div><span class="eyebrow">HEUTE IN DEINER REGION</span><h2>Was passiert gerade in ${escapeHtml(regionName)}?</h2></div><button type="button" data-ec-activation="region">Region wechseln</button></div>
      <div class="ec-today-region-grid">
        <button type="button" data-ec-today-kind="municipality" data-ec-today-nav="municipality"><span>🏛</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Gemeinde &amp; Service</strong><small>Offizielle Hinweise und regionale Services.</small><em>Öffnen →</em></button>
        <button type="button" data-ec-activation="events" data-ec-today-kind="events"><span>🎉</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Heute &amp; demnächst</strong><small>Veranstaltungen und gemeinsame Aktivitäten.</small><em>Events →</em></button>
        <button type="button" data-ec-activation="community" data-ec-today-kind="requests"><span>🤝</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Gesucht &amp; angeboten</strong><small>Hilfe, Gesuche und regionale Aufrufe.</small><em>Mitmachen →</em></button>
        <button type="button" data-ec-activation="members" data-ec-today-kind="members"><span>👋</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Menschen</strong><small>Neue und aktive Mitglieder aus ${escapeHtml(regionName)}.</small><em>Entdecken →</em></button>
        <button type="button" data-ec-activation="forum" data-ec-today-kind="forum"><span>💬</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Aus der Community</strong><small>Neue Beiträge und Gespräche.</small><em>Mitreden →</em></button>
        <button type="button" data-ec-today-kind="business" data-ec-today-nav="community"><span>🏢</span><b class="ec-today-count" aria-label="Anzahl">–</b><strong>Regionale Unternehmen</strong><small>Lokale Angebote, Jobs und Chancen.</small><em>Entdecken →</em></button>
      </div>
      <section class="ec-weekly-region-recap" aria-live="polite">
        <div><span class="eyebrow">DIESE WOCHE</span><h3>Noch wird zusammengezählt …</h3><p>Der Wochenrückblick fasst die wichtigsten Aktivitäten deiner Region automatisch zusammen.</p></div>
        <button type="button" data-ec-weekly-open="community">Alles entdecken →</button>
      </section>
    </section>

    <section class="ec-first-steps">
      <div class="ec-first-steps-head"><div><span class="eyebrow">MITMACHEN</span><h2>Dein nächster Schritt in der Region</h2><p>Profil ergänzen, passende Gruppen finden oder kurz im Forum Servus sagen.</p></div><span class="ec-first-steps-badge">Schnellstart</span></div>
      <div class="ec-first-steps-grid">
        <button type="button" data-ec-activation="profile"><span>1</span><div><strong>Profil ergänzen</strong><small>Interessen und regionale Infos sichtbar machen.</small></div></button>
        <button type="button" data-ec-activation="groups"><span>2</span><div><strong>Gruppe finden</strong><small>Menschen mit gemeinsamen Interessen entdecken.</small></div></button>
        <button type="button" data-ec-activation="forum"><span>3</span><div><strong>Servus sagen</strong><small>Mit einem ersten Beitrag ins Gespräch kommen.</small></div></button>
      </div>
    </section>

    <section class="ec-introduce-nudge"><div><span class="eyebrow">REGIONAL DABEI</span><h2>Ein kurzer Beitrag reicht für den Anfang.</h2><p>Teile eine Frage, einen Tipp oder etwas, das gerade in deiner Region wichtig ist.</p></div><button type="button" class="primary-button" data-ec-activation="forum">Beitrag starten</button></section>`;

  section.querySelector('[data-ec-activation="region"]')?.addEventListener('click', openRegionPicker);
  for (const page of ['profile', 'groups', 'members', 'events', 'community', 'forum']) {
    bindNavigation(section, `[data-ec-activation="${page}"]`, page);
  }
  section.querySelectorAll('[data-ec-today-nav]').forEach((button) => button.addEventListener('click', () => navigateTo(button.dataset.ecTodayNav)));
  section.querySelectorAll('[data-ec-weekly-open]').forEach((button) => button.addEventListener('click', () => navigateTo(button.dataset.ecWeeklyOpen)));
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
    const people = activation.querySelector('[data-ec-today-kind="members"] small');
    if (people) people.textContent = `Neue Menschen aus ${regionName} kennenlernen.`;
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
