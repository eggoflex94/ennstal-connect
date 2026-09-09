const ACTIONS = [
  ['♟', 'Mitglieder entdecken', 'Finde Menschen aus deiner Region.', 'members'],
  ['▤', 'Im Forum mitreden', 'Fragen stellen, helfen und diskutieren.', 'forum'],
  ['●', 'Gruppen entdecken', 'Gemeinsame Interessen und Aktivitäten finden.', 'groups'],
  ['▣', 'Events ansehen', 'Treffen und Veranstaltungen in der Region.', 'events']
];

function navigate(page) {
  window.dispatchEvent(new CustomEvent('ec:navigate', { detail: { page } }));
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
      <strong>Mach mit statt nur mitzulesen.</strong>
      <small>Ein Klick bringt dich direkt dorthin, wo in Ennstal Connect etwas passiert.</small>
    </div>
    <div class="ec-community-quickstart-actions"></div>
  `;
  const actions = panel.querySelector('.ec-community-quickstart-actions');
  ACTIONS.forEach(([icon, title, text, target]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ec-community-quickstart-action';
    button.innerHTML = `<b aria-hidden="true">${icon}</b><span><strong>${title}</strong><small>${text}</small></span><em aria-hidden="true">→</em>`;
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

  pulse.innerHTML = `
    <div class="ec-community-pulse-head">
      <div>
        <span>WAS IST GERADE LOS?</span>
        <strong>Deine Community auf einen Blick</strong>
        <small>Aktuelle Signale aus der ausgewählten Region.</small>
      </div>
      <button type="button" class="ec-community-pulse-cta">Im Forum mitreden →</button>
    </div>
    <div class="ec-community-pulse-stats">
      <button type="button" data-page="events"><b>${eventCount}</b><span>kommende Events</span></button>
      <button type="button" data-page="members"><b>${birthdayCount}</b><span>Geburtstage</span></button>
      <button type="button" data-page="members"><b>${updateCount}</b><span>Profil-Updates</span></button>
      <button type="button" data-page="community"><b>${photoCount}</b><span>Community-Fotos</span></button>
    </div>
    <div class="ec-community-pulse-feed">
      <button type="button" data-page="events"><em>▣</em><span><strong>Nächstes Event</strong><small>${firstRowSummary(eventsPanel, 'Noch kein kommendes Event eingetragen.')}</small></span></button>
      <button type="button" data-page="members"><em>◉</em><span><strong>Neu aus Profilen</strong><small>${firstRowSummary(updatesPanel, 'Noch keine neue Profil-Aktivität.')}</small></span></button>
      <button type="button" data-page="members"><em>✦</em><span><strong>Demnächst Geburtstag</strong><small>${firstRowSummary(birthdaysPanel, 'Keine freigegebenen Geburtstage in der Vorschau.')}</small></span></button>
    </div>
  `;

  pulse.querySelector('.ec-community-pulse-cta')?.addEventListener('click', () => navigate('forum'));
  pulse.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.page)));
}

function enhanceCommunity() {
  const page = document.querySelector('.community-hub');
  if (!page) return;
  page.classList.add('ec-community-upgraded');
  buildQuickStart(page);
  buildPulse(page);
  page.querySelectorAll('.community-hub-grid>.panel,.community-contact-sidebar>.panel,.community-ads').forEach((card) => {
    card.classList.add('ec-community-card');
  });
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    enhanceCommunity();
  });
}

new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('ec:region-change', schedule);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
