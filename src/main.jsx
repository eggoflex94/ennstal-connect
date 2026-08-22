<footer className="siteFooter">
  <div>
    © 2026 ennstal connect · Regional. Verbunden. Sicher.
  </div>

  <div className="footerLinks">
    <button onClick={() => setLegalPage('impressum')}>
      Impressum
    </button>

    <button onClick={() => setLegalPage('datenschutz')}>
      Datenschutz
    </button>

    <button onClick={() => setLegalPage('regeln')}>
      Community-Regeln
    </button>
  </div>
</footer>

{legalPage === 'impressum' && (
  <div className="legalBackdrop">
    <div className="legalModal">

      <button
        className="close"
        onClick={() => setLegalPage(null)}
      >
        ×
      </button>

      <h1>Impressum</h1>

      <h2>Angaben zum Betreiber</h2>

      <p>
        <strong>Betreiber und Medieninhaber</strong><br />
        Marco Egger<br />
        Waidbachstraße<br />
        8700 Leoben<br />
        Österreich
      </p>

      <p>
        <strong>E-Mail:</strong><br />
        eggermarco@gmx.net
      </p>

      <h2>Verantwortlich für den Inhalt</h2>

      <p>
        Marco Egger<br />
        Waidbachstraße<br />
        8700 Leoben<br />
        Österreich
      </p>

      <h2>Zweck der Website</h2>

      <p>
        ennstal connect ist eine regionale Online-Community
        für Menschen aus dem Ennstal, der Obersteiermark
        und den umliegenden Regionen.
      </p>

      <p>Die Plattform dient insbesondere:</p>

      <ul>
        <li>der Vernetzung von Menschen</li>
        <li>dem Austausch innerhalb der Community</li>
        <li>der Entdeckung von Aktivitäten und Veranstaltungen</li>
        <li>der Bildung von Gruppen und gemeinsamen Interessen</li>
        <li>dem Teilen von Informationen und Erfahrungen</li>
        <li>der Förderung regionaler Gemeinschaft und Begegnung</li>
      </ul>

      <h2>Grundlegende Richtung</h2>

      <p>
        ennstal connect dient der Information, Vernetzung
        und Kommunikation von Menschen innerhalb einer
        regionalen Online-Community.
      </p>

      <p>
        Die grundlegende Ausrichtung der Plattform ist die
        Förderung von Gemeinschaft, regionalem Austausch,
        gemeinsamen Aktivitäten, Veranstaltungen und
        sozialen Kontakten.
      </p>

      <h2>Haftung für Inhalte</h2>

      <p>
        Die Inhalte dieser Website werden mit größtmöglicher
        Sorgfalt erstellt. Dennoch kann keine Gewähr für
        Richtigkeit, Vollständigkeit und Aktualität sämtlicher
        Inhalte übernommen werden.
      </p>

      <p>
        Beiträge, Kommentare und sonstige Inhalte von
        Community-Mitgliedern geben nicht zwingend die Meinung
        des Betreibers wieder. Für eigene veröffentlichte
        Inhalte sind die jeweiligen Nutzerinnen und Nutzer
        grundsätzlich selbst verantwortlich.
      </p>

      <p>
        Bei Bekanntwerden von rechtswidrigen Inhalten werden
        diese im Rahmen der gesetzlichen Möglichkeiten geprüft
        und gegebenenfalls entfernt.
      </p>

      <h2>Haftung für Links</h2>

      <p>
        Diese Website kann Links zu externen Websites Dritter
        enthalten. Auf deren Inhalte besteht kein Einfluss.
        Für die Inhalte externer Websites ist ausschließlich
        der jeweilige Betreiber verantwortlich.
      </p>

      <p>
        Bei Bekanntwerden von Rechtsverletzungen werden
        entsprechende Links im Rahmen der technischen und
        rechtlichen Möglichkeiten entfernt.
      </p>

      <h2>Urheberrecht</h2>

      <p>
        Die vom Betreiber erstellten Inhalte, Texte, Grafiken,
        Logos, Designs und sonstigen Inhalte dieser Website
        unterliegen dem Urheberrecht und anderen gesetzlichen
        Schutzbestimmungen.
      </p>

      <p>
        Eine Vervielfältigung, Bearbeitung, Verbreitung oder
        sonstige Verwendung außerhalb der gesetzlichen Grenzen
        ist ohne vorherige Zustimmung des jeweiligen
        Rechteinhabers nicht gestattet.
      </p>

      <h2>Inhalte von Community-Mitgliedern</h2>

      <p>
        Registrierte Nutzerinnen und Nutzer können – abhängig
        von den verfügbaren Funktionen – eigene Inhalte,
        Beiträge, Kommentare, Bilder oder sonstige
        Informationen veröffentlichen.
      </p>

      <p>
        Für diese Inhalte ist grundsätzlich die jeweils
        veröffentlichende Person verantwortlich.
      </p>

      <p>Insbesondere untersagt sind:</p>

      <ul>
        <li>rechtswidrige Inhalte</li>
        <li>beleidigende oder diskriminierende Inhalte</li>
        <li>gewaltverherrlichende Inhalte</li>
        <li>menschenverachtende Inhalte</li>
        <li>urheberrechtsverletzende Inhalte</li>
        <li>personenbezogene Daten Dritter ohne Berechtigung</li>
        <li>Spam oder betrügerische Inhalte</li>
        <li>Inhalte, die Rechte Dritter verletzen</li>
      </ul>

      <p>
        Der Betreiber behält sich vor, Inhalte oder
        Benutzerkonten bei Verstößen gegen geltende Gesetze
        oder die Community-Regeln zu prüfen, einzuschränken
        oder zu entfernen.
      </p>

      <h2>Meldung rechtswidriger Inhalte</h2>

      <p>
        Rechtswidrige oder möglicherweise rechtsverletzende
        Inhalte können per E-Mail gemeldet werden:
      </p>

      <p>
        <strong>eggermarco@gmx.net</strong>
      </p>

      <p>
        Bitte gib möglichst einen Link oder eine genaue
        Beschreibung des betreffenden Inhalts sowie den Grund
        der Meldung an.
      </p>

      <h2>Datenschutz</h2>

      <p>
        Informationen zur Verarbeitung personenbezogener Daten
        findest du in der Datenschutzerklärung von
        ennstal connect.
      </p>

      <p>
        <strong>Stand: August 2026</strong>
      </p>

    </div>
  </div>
)}
