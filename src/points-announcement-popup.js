import { supabase } from './supabaseClient';

const POPUP_ID = 'ec-points-announcement-popup';
let opening = false;
let currentAnnouncement = null;

function getThemeHint() {
  const html = document.documentElement;
  const body = document.body;
  const values = [
    html?.dataset?.theme,
    html?.dataset?.profileTheme,
    html?.dataset?.layoutTheme,
    body?.dataset?.theme,
    body?.dataset?.profileTheme,
    body?.dataset?.layoutTheme,
    html?.className,
    body?.className,
    localStorage.getItem('ec-theme'),
    localStorage.getItem('ec-profile-theme'),
    localStorage.getItem('ec-layout-theme')
  ].filter(Boolean).join(' ').toLowerCase();
  if (values.includes('blue') || values.includes('blau')) return 'blue';
  if (values.includes('red') || values.includes('rot')) return 'red';
  return 'default';
}

function logoForTheme() {
  const theme = getThemeHint();
  if (theme === 'red') return '/ennstal-connect-wordmark-red.svg';
  if (theme === 'blue') return '/ennstal-connect-wordmark-blue.svg';
  return '/ennstal-connect-wordmark.svg';
}

function closePopup() {
  document.getElementById(POPUP_ID)?.remove();
}

async function acknowledge() {
  if (!currentAnnouncement?.id) return;
  const button = document.querySelector(`#${POPUP_ID} .ec-points-announcement-confirm`);
  if (button) {
    button.disabled = true;
    button.textContent = 'Wird gespeichert …';
  }
  const { error } = await supabase.rpc('acknowledge_community_announcement', {
    p_announcement_id: currentAnnouncement.id
  });
  if (error) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Verstanden';
    }
    console.warn('Ankündigung konnte nicht bestätigt werden:', error.message);
    return;
  }
  closePopup();
}

function renderPopup(announcement) {
  closePopup();
  currentAnnouncement = announcement;
  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'ec-points-announcement-overlay';
  overlay.innerHTML = `
    <section class="ec-points-announcement-card" role="dialog" aria-modal="true" aria-labelledby="ec-points-announcement-title">
      <div class="ec-points-announcement-brand">
        <img src="${logoForTheme()}" alt="Ennstal Connect">
      </div>
      <div class="ec-points-announcement-badge">NEU IN ENNSTAL CONNECT</div>
      <h1 id="ec-points-announcement-title">${String(announcement.title || 'Neues Punktesystem')}</h1>
      <p class="ec-points-announcement-intro">Ab sofort gilt unser neues, transparentes Community-Punktesystem.</p>

      <div class="ec-points-announcement-points">
        <article class="is-plus">
          <strong>+ Pluspunkte</strong>
          <span>für wertvolle Forenbeiträge, hilfreiche Unterstützung, sinnvolle Community-Aktivität und weitere positive Beiträge.</span>
        </article>
        <article class="is-minus">
          <strong>− Minuspunkte</strong>
          <span>bei Regelverstößen. Jede manuelle Vergabe wird mit Grund dokumentiert und automatisch mitgeteilt.</span>
        </article>
      </div>

      <div class="ec-points-announcement-info">
        <p><strong>Wer darf Punkte vergeben?</strong><br>Nur berechtigte Administratoren: Betreiber (Hauptadmin), Community Admins und zuständige Regional Admins innerhalb ihrer Region.</p>
        <p><strong>Unstimmigkeiten?</strong><br>Bei Beschwerden zur Punktevergabe ist der Betreiber (Hauptadmin) zuständig. Beschwerden sind schriftlich einzubringen.</p>
        <p><strong>Wichtig:</strong> Alle Community-Regeln und Details zum Punktesystem findest du oben in der Navigation unter <strong>„Regeln“</strong>.</p>
      </div>

      <button type="button" class="ec-points-announcement-confirm">Verstanden</button>
    </section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.ec-points-announcement-confirm')?.addEventListener('click', () => void acknowledge());
}

async function checkAnnouncement() {
  if (opening || document.getElementById(POPUP_ID)) return;
  opening = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase.rpc('my_pending_community_announcement');
    if (error) throw error;
    if (data?.id) renderPopup(data);
  } catch (error) {
    console.warn('Community-Ankündigung konnte nicht geladen werden:', error?.message || error);
  } finally {
    opening = false;
  }
}

function updatePopupLogo() {
  const image = document.querySelector(`#${POPUP_ID} .ec-points-announcement-brand img`);
  if (image) image.src = logoForTheme();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void checkAnnouncement(), { once: true });
} else {
  void checkAnnouncement();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) window.setTimeout(() => void checkAnnouncement(), 250);
  else closePopup();
});

new MutationObserver(updatePopupLogo).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class', 'data-theme', 'data-profile-theme', 'data-layout-theme']
});
window.addEventListener('ec:activity-progress-refresh', updatePopupLogo);
