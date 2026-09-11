import './home-social-events.js';
import './community-engagement-upgrade.css';

const ACTIONS = [
  ['♟', 'Mitglieder entdecken', 'Finde Menschen aus deiner Region.', 'members'],
  ['▤', 'Im Forum mitreden', 'Fragen stellen, helfen und diskutieren.', 'forum'],
  ['●', 'Gruppen entdecken', 'Gemeinsame Interessen und Aktivitäten finden.', 'groups'],
  ['▣', 'Events ansehen', 'Treffen und Veranstaltungen in der Region.', 'events'],
  ['♙', 'Freunde ansehen', 'Bleib mit deinen Kontakten verbunden.', 'friends'],
  ['✉', 'Nachrichten', 'Schreib direkt mit deinen Kontakten.', 'messages']
];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function navigate(page) {
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
}

function ensureCommunityStyles() {
  if (document.getElementById('ec-community-section-nav-style')) return;
  const style = document.createElement('style');
  style.id = 'ec-community-section-nav-style';
  style.textContent = `
    .ec-community-section-nav{display:flex;gap:7px;flex-wrap:wrap;margin:-5px 0 14px;padding:8px;border:1px solid rgba(23,50,74,.09);border-radius:14px;background:rgba(255,255,255,.78);box-shadow:0 6px 18px rgba(23,50,74,.04)}
    .ec-community-section-nav button{min-height:34px;padding:6px 10px;border:1px solid rgba(23,50,74,.10);border-radius:999px;background:#fff;color:#29445e;font-size:.69rem;font-weight:850;line-height:1;white-space:nowrap;cursor:pointer}
    .ec-community-section-nav button:hover,.ec-community-section-nav button:focus-visible{border-color:rgba(13,105,219,.32);background:#f4f8fc;outline:none}
    .community-hub .ec-community-card{scroll-margin-top:110px}
    .community-hub .ec-community-card.is-community-focus{outline:2px solid rgba(13,105,219,.24);outline-offset:2px;transition:outline-color .2s ease}
    @media(max-width:620px){.ec-community-section-nav{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding:7px}.ec-community-section-nav button{flex:0 0 auto;font-size:.66rem}}
  `;
  document.head.appendChild(style);
}

function buildQuickStart(page) {
  if (page.querySelector('.ec-community-quickstart')) return;
  const heading = page.querySelector('.page-heading');
  if (!heading) return;

  const panel = document.createElement('section');
  panel.className = 'ec-community-quickstart';
  panel.innerHTML = `
    <div class="ec-community-quickstart-copy">
      <span>COMMUNITY SCHNELLSTART</span>
      <strong>Was möchtest du machen?</strong>
      <small>Direkt zu Menschen, Gesprächen, Gruppen und Terminen aus deiner Region.</small>
    </div>
    <div class="ec-community-quickstart-actions"></div>
  `;
  const actions = panel.querySelector('.ec-community-quickstart-actions');
  ACTIONS.forEach(([icon, title, text, target]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-community-quickstart-action';
    button.setAttribute('aria-label', title);
    button.innerHTML = `<b aria-hidden="true">${icon}</b><span><strong>${esc(title)}</strong><small>${esc(text)}</small></span><em aria-hidden="true">→</em>`;
    button.addEventListener('click', () => navigate(target));
    actions.appendChild(button);
  });
  heading.insertAdjacentElement('afterend', panel);
}

function panelByHeading(page, headingText) {
  return [...page.querySelectorAll('.panel')].find((panel) =>
    (panel.querySelector('h2')?.textContent || '').trim().toLowerCase().includes(headingText.toLowerCase())
  );
}

function firstRowSummary(panel, fallback) {
  const row = panel?.querySelector('.hub-row');
  if (!row) return fallback;
  const title = row.querySelector('strong')?.textContent?.trim();
  const detail = row.querySelector('span')?.textContent?.trim();
  return [title, detail].filter(Boolean).join(' · ') || fallback;
}

function buildPulse(page) {
  let pulse = page.querySelector('.ec-community-pulse');
  if (!pulse) {
    pulse = document.createElement('section');
    pulse.className = 'ec-community-pulse';
    const quick = page.querySelector('.ec-community-quickstart');
    (quick || page.querySelector('.page-heading'))?.insertAdjacentElement('afterend', pulse);
  }

  const eventsPanel = panelByHeading(page, 'Nächste Veranstaltungen');
  const birthdaysPanel = panelByHeading(page, 'Demnächst');
  const updatesPanel = page.querySelector('.public-profile-updates');
  const photoPanel = panelByHeading(page, 'Mitgliederfotos');

  const eventCount = eventsPanel?.querySelectorAll('.hub-row').length || 0;
  const birthdayCount = birthdaysPanel?.querySelectorAll('.hub-row').length || 0;
  const updateCount = updatesPanel?.querySelectorAll('.hub-row').length || 0;
  const photoCount = photoPanel?.querySelectorAll('.photo-strip img').length || 0;
  const nextEvent = esc(firstRowSummary(eventsPanel, 'Noch kein kommendes Event eingetragen.'));
  const nextUpdate = esc(firstRowSummary(updatesPanel, 'Noch keine neue Profil-Aktivität.'));
  const nextBirthday = esc(firstRowSummary(birthdaysPanel, 'Keine freigegebenen Geburtstage in der Vorschau.'));

  pulse.innerHTML = `
    <div class="ec-community-pulse-head">
      <div>
        <span>WAS IST GERADE LOS?</span>
        <strong>Deine Region auf einen Blick</strong>
        <small>Aktuelle Community-Signale, ohne lange suchen zu müssen.</small>
      </div>
      <button type="button" class="ec-community-pulse-cta">Im Forum mitreden →</button>
    </div>
    <div class="ec-community-pulse-stats">
      <button type="button" data-page="events" aria-label="Kommende Events öffnen"><b>${eventCount}</b><span>kommende Events</span></button>
      <button type="button" data-page="members" aria-label="Geburtstage ansehen"><b>${birthdayCount}</b><span>Geburtstage</span></button>
      <button type="button" data-page="members" aria-label="Profil-Aktualisierungen ansehen"><b>${updateCount}</b><span>Profil-Updates</span></button>
      <button type="button" data-page="community" aria-label="Community-Fotos ansehen"><b>${photoCount}</b><span>Community-Fotos</span></button>
    </div>
    <div class="ec-community-pulse-feed">
      <button type="button" data-page="events"><em>▣</em><span><strong>Nächstes Event</strong><small>${nextEvent}</small></span></button>
      <button type="button" data-page="members"><em>◉</em><span><strong>Neu aus Profilen</strong><small>${nextUpdate}</small></span></button>
      <button type="button" data-page="members"><em>✦</em><span><strong>Demnächst Geburtstag</strong><small>${nextBirthday}</small></span></button>
    </div>
  `;

  pulse.querySelector('.ec-community-pulse-cta')?.addEventListener('click', () => navigate('forum'));
  pulse.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.page)));
}

function focusCard(card) {
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('is-community-focus');
  window.setTimeout(() => card.classList.remove('is-community-focus'), 1100);
}

function buildSectionNav(page) {
  let nav = page.querySelector('.ec-community-section-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'ec-community-section-nav';
    nav.setAttribute('aria-label', 'Community-Bereiche');
    const pulse = page.querySelector('.ec-community-pulse');
    (pulse || page.querySelector('.ec-community-quickstart') || page.querySelector('.page-heading'))?.insertAdjacentElement('afterend', nav);
  }

  const sections = [
    ['Termine', panelByHeading(page, 'Nächste Veranstaltungen')],
    ['Geburtstage', panelByHeading(page, 'Demnächst')],
    ['Fotos', panelByHeading(page, 'Mitgliederfotos')],
    ['Administration', panelByHeading(page, 'Administration')],
    ['Moderation', panelByHeading(page, 'Forum & Gruppen')],
    ['Unternehmen', panelByHeading(page, 'Unternehmenskonten')],
    ['Profil-Updates', page.querySelector('.public-profile-updates')],
    ['Regionale Angebote', page.querySelector('.community-ads')]
  ].filter(([, target]) => target);

  nav.replaceChildren();
  sections.forEach(([label, target]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => focusCard(target));
    nav.appendChild(button);
  });
}

function enhanceCommunity() {
  const page = document.querySelector('.community-hub');
  if (!page) return false;
  ensureCommunityStyles();
  page.classList.add('ec-community-upgraded');
  buildQuickStart(page);
  buildPulse(page);
  page.querySelectorAll('.community-hub-grid>.panel,.community-contact-sidebar>.panel,.community-ads').forEach((card) => {
    card.classList.add('ec-community-card');
  });
  buildSectionNav(page);
  return true;
}

let retryTimer = null;
function schedule(retries = 8) {
  clearTimeout(retryTimer);
  const run = (remaining) => {
    if (enhanceCommunity() || remaining <= 0) return;
    retryTimer = setTimeout(() => run(remaining - 1), 180);
  };
  requestAnimationFrame(() => run(retries));
}

window.addEventListener('ec:navigate', () => schedule());
window.addEventListener('ec:region-change', () => schedule(5));
window.addEventListener('focus', () => {
  if (document.querySelector('.community-hub')) schedule(2);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(), { once: true });
else schedule();
