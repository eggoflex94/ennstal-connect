const PREVIEW_ID = 'ec-auth-member-preview-modern';

function makePreview() {
  const preview = document.createElement('section');
  preview.id = PREVIEW_ID;
  preview.className = 'ec-auth-member-preview-modern';
  preview.setAttribute('aria-label', 'Das erwartet dich bei Ennstal Connect');
  preview.innerHTML = `
    <div class="ec-auth-preview-head">
      <span>DEIN REGIONALER VORTEIL</span>
      <h2>Was dich nach der Anmeldung erwartet</h2>
      <p>Eine Community für Menschen, Unternehmen, Veranstaltungen und Hilfe direkt aus deiner Region – mit der Freiheit, jederzeit zwischen Regionen zu wechseln.</p>
    </div>
    <div class="ec-auth-preview-grid">
      <article><b>🤝</b><strong>Menschen kennenlernen</strong><small>Finde Mitglieder aus deiner Region und knüpfe neue private oder berufliche Kontakte.</small></article>
      <article><b>💼</b><strong>Jobs &amp; Business</strong><small>Entdecke regionale Unternehmen, Kooperationen, Angebote und berufliche Chancen.</small></article>
      <article><b>🎉</b><strong>Events &amp; Freizeit</strong><small>Sieh, was in deiner Region passiert, und finde Menschen für gemeinsame Aktivitäten.</small></article>
      <article><b>💡</b><strong>Empfehlungen &amp; Hilfe</strong><small>Frag die Community nach Tipps, Kontakten und Unterstützung aus deiner Umgebung.</small></article>
    </div>
    <div class="ec-auth-preview-flow">
      <span><b>1</b> Kostenlos registrieren</span>
      <span><b>2</b> Heimatregion wählen</span>
      <span><b>3</b> Menschen &amp; Möglichkeiten entdecken</span>
    </div>
    <div class="ec-auth-preview-note"><strong>Eine Community. Mehrere Regionen.</strong><span>Deine Heimatregion bestimmt deinen lokalen Bezug – wechseln und entdecken kannst du trotzdem regionsübergreifend.</span></div>
  `;
  return preview;
}

function enhanceAuthPage() {
  const page = document.querySelector('.auth-page');
  const intro = page?.querySelector('.ec-auth-intro');
  if (!page || !intro) return false;

  const eyebrow = intro.querySelector(':scope > .eyebrow');
  const heading = intro.querySelector(':scope > h1');
  const lead = intro.querySelector(':scope > p');
  if (eyebrow) eyebrow.textContent = 'EINE COMMUNITY · MEHRERE REGIONEN';
  if (heading) heading.textContent = 'Deine Region. Deine Menschen. Deine Möglichkeiten.';
  if (lead) lead.textContent = 'Ennstal Connect verbindet Menschen, Unternehmen, Events und regionale Chancen – übersichtlich nach Region und trotzdem Teil eines gemeinsamen Netzwerks.';

  intro.querySelector('.ec-auth-whats-new')?.setAttribute('hidden', '');
  intro.querySelector('.ec-auth-roles')?.setAttribute('hidden', '');

  if (!document.getElementById(PREVIEW_ID)) {
    const regions = intro.querySelector('.ec-auth-regions');
    const preview = makePreview();
    if (regions) regions.after(preview);
    else intro.appendChild(preview);
  }
  return true;
}

let queued = false;
function queueEnhance() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    enhanceAuthPage();
  });
}

const observer = new MutationObserver(queueEnhance);
observer.observe(document.documentElement, { childList: true, subtree: true });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queueEnhance, { once: true });
else queueEnhance();
