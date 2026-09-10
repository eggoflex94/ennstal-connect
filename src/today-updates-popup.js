import { supabase } from './supabaseClient';

const RELEASE_VERSION = '2026-09-10-community-update-v2';
const RELEASE_TITLE = 'Neu bei Ennstal Connect';
let pendingUserId = null;
let onboardingStateKnown = false;
let onboardingNeeded = false;

const UPDATES = [
  ['Globale Suche', 'Mitglieder, Gruppen, Events, Forum und Neuigkeiten lassen sich jetzt über ein gemeinsames Suchfeld finden.'],
  ['Vertrauensprofil erweitert', 'Bei Profilen siehst du gemeinsame Freunde, gemeinsame Gruppen und gemeinsame aktive Events – transparent und ohne geheime Bewertung.'],
  ['Navigation stabilisiert', 'Der aktive Bereich in der oberen Navigation bleibt jetzt auch nach Seitenwechseln und Aktualisieren korrekt markiert.'],
  ['Mein Bereich verbessert', 'Die persönliche Seitenleiste wurde stabiler und übersichtlicher gemacht; Admin-Zugänge werden klarer eingeordnet.'],
  ['Mehr Stabilität', 'Mehrere unnötige globale DOM-Beobachter wurden entfernt, damit die Community ruhiger und zuverlässiger läuft.'],
  ['Sicherheit verstärkt', 'Interne Prüfbereiche und sensible Verwaltungsfunktionen wurden weiter abgesichert.'],
  ['Community-Level', 'Aktive Nutzung, Beiträge, Freundschaften, Gruppen und Events zahlen weiter auf deinen Community-Fortschritt ein.']
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

function canShowNow() {
  return onboardingStateKnown && !onboardingNeeded && !document.querySelector('.ec-onboarding-v2') && !document.body.classList.contains('ec-onboarding-open');
}

function showPopup(userId) {
  if (!userId || hasSeen(userId) || document.querySelector('.ec-release-popup-overlay')) return;
  if (!canShowNow()) {
    pendingUserId = userId;
    return;
  }

  pendingUserId = null;
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
          <span class="ec-release-kicker">NEU · 10. SEPTEMBER 2026</span>
          <h1 id="ec-release-popup-title">${RELEASE_TITLE}</h1>
          <p>Ennstal Connect wurde in den letzten Tagen an mehreren Stellen erweitert, stabilisiert und sicherer gemacht.</p>
        </div>
        <button type="button" class="ec-release-close" aria-label="Neuerungen schließen">×</button>
      </header>
      <div class="ec-release-update-list">${cards}</div>
      <footer>
        <small>Die Hinweise erscheinen pro Mitglied nur einmal für diese Version.</small>
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

async function queueForUser(userId) {
  if (!userId || hasSeen(userId)) return;
  pendingUserId = userId;
  onboardingStateKnown = false;
  try {
    const { data, error } = await supabase.rpc('member_onboarding_status');
    if (!error) {
      onboardingNeeded = !data?.[0]?.completed;
      onboardingStateKnown = true;
    } else {
      onboardingNeeded = false;
      onboardingStateKnown = true;
    }
  } catch {
    onboardingNeeded = false;
    onboardingStateKnown = true;
  }
  if (!onboardingNeeded) window.setTimeout(() => showPopup(userId), 250);
}

async function showForCurrentSession() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (userId) void queueForUser(userId);
}

window.addEventListener('ec:onboarding-opened', () => {
  onboardingNeeded = true;
  onboardingStateKnown = true;
  document.querySelector('.ec-release-popup-overlay')?.remove();
  document.body.classList.remove('ec-release-popup-open');
});

window.addEventListener('ec:onboarding-unneeded', (event) => {
  onboardingNeeded = false;
  onboardingStateKnown = true;
  const userId = event.detail?.userId || pendingUserId;
  if (userId) window.setTimeout(() => showPopup(userId), 250);
});

window.addEventListener('ec:onboarding-closed', (event) => {
  onboardingNeeded = false;
  onboardingStateKnown = true;
  const userId = event.detail?.userId || pendingUserId;
  if (userId) window.setTimeout(() => showPopup(userId), 320);
});

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'SIGNED_IN' || !session?.user?.id) return;
    void queueForUser(session.user.id);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void showForCurrentSession(), { once: true });
  else void showForCurrentSession();
}
