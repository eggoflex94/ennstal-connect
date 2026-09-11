const RULES_ID = 'ec-community-rules';

function closeRules() {
  document.getElementById(RULES_ID)?.remove();
}

function openRules() {
  closeRules();
  const overlay = document.createElement('div');
  overlay.id = RULES_ID;
  overlay.className = 'ec-community-rules-overlay';
  overlay.innerHTML = `
    <section class="ec-community-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="ec-community-rules-title">
      <header class="ec-community-rules-head">
        <div>
          <span>ENNSTAL CONNECT</span>
          <h1 id="ec-community-rules-title">Community-Regeln</h1>
          <p>Ein respektvolles, hilfreiches und faires Miteinander ist die Grundlage unserer Community.</p>
        </div>
        <button type="button" class="ec-community-rules-close" aria-label="Regeln schließen">×</button>
      </header>

      <div class="ec-community-rules-grid">
        <article>
          <h2>1. Respektvoll miteinander umgehen</h2>
          <p>Behandle andere Mitglieder respektvoll. Beleidigungen, persönliche Angriffe, Belästigung, Diskriminierung, Drohungen und bewusstes Provozieren haben in der Community keinen Platz.</p>
        </article>
        <article>
          <h2>2. Ehrlich und fair bleiben</h2>
          <p>Keine absichtlichen Falschinformationen, Identitätstäuschungen, manipulierten Inhalte oder irreführenden Behauptungen. Inhalte sollen nachvollziehbar und fair formuliert sein.</p>
        </article>
        <article>
          <h2>3. Sinnvolle Beiträge statt Spam</h2>
          <p>Forum, Gruppen, Kommentare und Nachrichten sollen einen erkennbaren Bezug zur Community haben. Wiederholter Spam, Werbung ohne Erlaubnis, absichtliche Störungen oder massenhaft gleiche Beiträge sind nicht erlaubt.</p>
        </article>
        <article>
          <h2>4. Privatsphäre schützen</h2>
          <p>Veröffentliche keine privaten Daten, Bilder, Nachrichten oder Kontaktdaten anderer Personen ohne deren Zustimmung. Persönliche Informationen sind besonders sorgfältig zu behandeln.</p>
        </article>
        <article>
          <h2>5. Recht und Sicherheit beachten</h2>
          <p>Illegale Inhalte, Gewaltandrohungen, Betrug, gefährliche Handlungsaufforderungen oder Inhalte, die andere Personen gefährden können, sind nicht zulässig.</p>
        </article>
        <article>
          <h2>6. Moderationsentscheidungen respektieren</h2>
          <p>Anweisungen von berechtigten Administratoren sind zu beachten. Wiederholtes Umgehen von Maßnahmen oder bewusstes Stören der Moderation kann als weiterer Regelverstoß gewertet werden.</p>
        </article>
      </div>

      <section class="ec-community-rules-points">
        <div class="is-minus">
          <span>MINUSPUNKTE</span>
          <h2>Regelverstöße können zu Minuspunkten führen</h2>
          <p>Bei Regelverstößen können berechtigte Administratoren Minuspunkte vergeben. Jede manuelle Punktevergabe muss mit einem nachvollziehbaren Grund dokumentiert werden. Das betroffene Mitglied erhält dazu automatisch eine Nachricht mit Punktebetrag, Grund und dem Administrator, der die Punkte vergeben hat.</p>
        </div>
        <div class="is-plus">
          <span>PLUSPUNKTE</span>
          <h2>Wertvolle Beiträge werden anerkannt</h2>
          <p>Hilfreiche Forenbeiträge, konstruktive Unterstützung anderer Mitglieder, sinnvolle Community-Hilfe, aktive Beteiligung und weitere positive Beiträge können mit Pluspunkten honoriert werden. Auch automatische Aktivitätspunkte, etwa für aktive Onlinezeit, können in das Punktesystem einfließen.</p>
        </div>
      </section>

      <section class="ec-community-rules-admin">
        <span>PUNKTEVERGABE & BESCHWERDEN</span>
        <h2>Wer darf Punkte vergeben?</h2>
        <p>Manuelle Plus- und Minuspunkte dürfen ausschließlich durch berechtigte Administratoren vergeben werden: Betreiber (Hauptadmin), Community Admins sowie zuständige Regional Admins innerhalb ihrer zugewiesenen Region.</p>
        <p>Jede Punktevergabe wird mit Grund im Punkteverlauf und im Admin-Logbuch festgehalten.</p>
        <h2>Unstimmigkeiten bei einer Punktevergabe</h2>
        <p>Wenn ein Mitglied eine Punktevergabe für falsch oder nicht nachvollziehbar hält, ist der <strong>Betreiber (Hauptadmin)</strong> die zuständige letzte interne Prüfungsinstanz. Die Beschwerde ist <strong>schriftlich</strong> einzubringen und soll die beanstandete Punktevergabe sowie eine kurze Begründung enthalten. Die Prüfung erfolgt anhand des Punkteverlaufs und der protokollierten Begründung.</p>
      </section>

      <footer>
        <strong>Grundsatz:</strong> Punkte dienen der nachvollziehbaren Anerkennung hilfreicher Beiträge und der transparenten Moderation von Regelverstößen.
      </footer>
    </section>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.ec-community-rules-close')?.addEventListener('click', closeRules);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeRules();
  });
}

function ensureRulesNavButton() {
  const nav = document.querySelector('.ec-top-nav');
  if (!nav) return;

  let button = nav.querySelector('[data-ec-rules-button="1"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.ecRulesButton = '1';
    button.className = 'ec-community-rules-nav';
    button.setAttribute('aria-label', 'Community-Regeln');
    button.setAttribute('title', 'Community-Regeln');
    button.innerHTML = '<b aria-hidden="true">§</b><span>Regeln</span>';
    const regionPicker = nav.querySelector('.ec-region-picker');
    if (regionPicker) nav.insertBefore(button, regionPicker);
    else nav.appendChild(button);
  }

  if (button.dataset.ecRulesBound !== '1') {
    button.dataset.ecRulesBound = '1';
    button.addEventListener('click', openRules);
  }
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    ensureRulesNavButton();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
else schedule();
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.getElementById(RULES_ID)) closeRules();
});
