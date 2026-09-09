import { supabase } from './supabaseClient';

const RELEASE_VERSION = '2026-09-09-community-update-v1';
const RELEASE_TITLE = 'Neu bei Ennstal Connect';

const UPDATES = [
  ['Handy wie am PC', 'Die vollständige Desktop-Oberfläche bleibt am Smartphone erhalten und ist für Touch, Navigation, Regionen, Mein Bereich und Profilgestaltung abgesichert.'],
  ['Profilbesuche synchronisiert', 'Neue Profilbesuche werden in „Mein Bereich“ automatisch aktualisiert.'],
  ['Mein Bereich überarbeitet', 'Der persönliche Bereich und sein Kopf passen jetzt optisch mit runden Karten zum restlichen Dashboard.'],
  ['Community-Schnellstart', 'Mitglieder, Forum, Gruppen und Community-Aktivitäten sind schneller erreichbar.'],
  ['Was ist gerade los?', 'Die Community zeigt aktuelle Events, Profil-Aktivität, Geburtstage und weitere Signale kompakt auf einen Blick.'],
  ['Aktivitäten mit Freunden', 'Du kannst freiwillig teilen, was du gerade machst – standardmäßig nur mit Freunden, auf Wunsch regional oder privat.'],
  ['Events teilen & Erinnerungen', 'Events können als Aktivität geteilt werden. Zusagen und Interesse erscheinen als kommende Erinnerungen.'],
  ['Events auf der Startseite', 'Aktuelle regionale Events stehen jetzt direkt auf der Startseite; der eigene Events-Punkt wurde aus der oberen Leiste entfernt.'],
  ['Events erweitert', 'Veranstaltungen lassen sich jetzt noch übersichtlicher gestalten – inklusive Bild, Schriftart, Schriftgröße, Schriftfarbe und Betonung.']
];

function storageKey(userId) {
  return `ec-release-seen:${userId}:${RELEASE_VERSION}`;
}

function hasSeen(userId) {
  try { return localStorage.getItem(storageKey(userId)) === '1'; }
  catch { return false; }
}

function markSeen(userId) {
  try { localStorage.setItem(storageKey(userId), '1'); } catch {}
}

function closePopup(overlay, userId) {
  markSeen(userId);
  overlay.remove();
  document.body.classList.remove('ec-release-popup-open');
}

function showPopup(userId) {
  if (!userId || hasSeen(userId) || document.querySelector('.ec-release-popup-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'ec-release-popup-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ec-release-popup-title');

  const cards = UPDATES.map(([title, text]) => `
    <article class="ec-release-update-card">
      <span aria-hidden="true">✓</span>
      <div><strong>${title}</strong><p>${text}</p></div>
    </article>
  `).join('');

  overlay.innerHTML = `
    <section class="ec-release-popup">
      <header>
        <div>
          <span class="ec-release-kicker">HEUTE NEU · 9. SEPTEMBER 2026</span>
          <h1 id="ec-release-popup-title">${RELEASE_TITLE}</h1>
          <p>Heute wurde Ennstal Connect an mehreren Stellen erweitert und stabilisiert.</p>
        </div>
        <button type="button" class="ec-release-close" aria-label="Neuerungen schließen">×</button>
      </header>
      <div class="ec-release-update-list">${cards}</div>
      <footer>
        <small>Aktivitäten werden nicht automatisch veröffentlicht. Du entscheidest selbst, was du teilst und wer es sehen darf.</small>
        <button type="button" class="primary-button ec-release-confirm">Alles klar</button>
      </footer>
    </section>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('ec-release-popup-open');
  overlay.querySelector('.ec-release-close').onclick = () => closePopup(overlay, userId);
  overlay.querySelector('.ec-release-confirm').onclick = () => closePopup(overlay, userId);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closePopup(overlay, userId);
  });
  overlay.querySelector('.ec-release-confirm')?.focus();
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session?.user?.id) return;
    window.setTimeout(() => showPopup(session.user.id), 450);
  });
}
