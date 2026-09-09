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

function enhanceCommunity() {
  const page = document.querySelector('.community-hub');
  if (!page) return;
  page.classList.add('ec-community-upgraded');
  buildQuickStart(page);
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
