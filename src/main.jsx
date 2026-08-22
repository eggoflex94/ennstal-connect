import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './styles.css';


/* =========================================
   ANMELDEN / REGISTRIEREN
========================================= */

function Auth({ onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    birth_date: '',
    nickname: '',
    email: '',
    password: ''
  });

  const setField = (key, value) => {
    setForm({
      ...form,
      [key]: value
    });
  };

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setMessage('');

    let error;

    if (mode === 'register') {
      ({ error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: form.first_name,
            last_name: form.last_name,
            birth_date: form.birth_date,
            nickname: form.nickname
          }
        }
      }));

      setMessage(
        error
          ? error.message
          : 'Registrierung erfolgreich. Bitte bestätige deine E-Mail. Danach wartet dein Konto auf die Freigabe.'
      );

    } else {

      ({ error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password
      }));

      setMessage(
        error
          ? error.message
          : 'Erfolgreich angemeldet.'
      );
    }

    setLoading(false);
  }

  return (
    <div className="modalBackdrop">

      <form
        className="authModal"
        onSubmit={submit}
      >

        <button
          type="button"
          className="close"
          onClick={onClose}
        >
          ×
        </button>

        <h2>
          {mode === 'login'
            ? 'Anmelden'
            : 'Mitglied werden'}
        </h2>


        {mode === 'register' && (
          <>

            <input
              required
              placeholder="Vorname"
              onChange={e =>
                setField(
                  'first_name',
                  e.target.value
                )
              }
            />

            <input
              required
              placeholder="Nachname"
              onChange={e =>
                setField(
                  'last_name',
                  e.target.value
                )
              }
            />

            <input
              required
              type="date"
              onChange={e =>
                setField(
                  'birth_date',
                  e.target.value
                )
              }
            />

            <input
              required
              minLength="3"
              placeholder="Nickname"
              onChange={e =>
                setField(
                  'nickname',
                  e.target.value
                )
              }
            />

          </>
        )}


        <input
          required
          type="email"
          placeholder="E-Mail-Adresse"
          onChange={e =>
            setField(
              'email',
              e.target.value
            )
          }
        />


        <input
          required
          minLength="8"
          type="password"
          placeholder="Passwort"
          onChange={e =>
            setField(
              'password',
              e.target.value
            )
          }
        />


        <button
          className="primary"
          disabled={loading}
        >
          {loading
            ? 'Bitte warten ...'
            : mode === 'login'
            ? 'Anmelden'
            : 'Registrieren'}
        </button>


        {message && (
          <div className="authMessage">
            {message}
          </div>
        )}


        <button
          type="button"
          className="switch"
          onClick={() =>
            setMode(
              mode === 'login'
                ? 'register'
                : 'login'
            )
          }
        >
          {mode === 'login'
            ? 'Noch kein Konto? Registrieren'
            : 'Bereits registriert? Anmelden'}
        </button>

      </form>

    </div>
  );
}


/* =========================================
   IMPRESSUM / DATENSCHUTZ / REGELN
========================================= */

function LegalModal({ type, onClose }) {

  const content = {


    /* =====================================
       IMPRESSUM
    ===================================== */

    impressum: {
      title: 'Impressum',

      body: (
        <>

          <h2>Betreiber und Medieninhaber</h2>

          <p>
            <strong>Marco Egger</strong>
            <br />
            Waidbachstraße
            <br />
            8700 Leoben
            <br />
            Österreich
          </p>


          <p>
            <strong>Kontakt</strong>
            <br />
            E-Mail: eggermarco@gmx.net
          </p>


          <h2>Verantwortlich für den Inhalt</h2>

          <p>
            Marco Egger
            <br />
            Waidbachstraße
            <br />
            8700 Leoben
            <br />
            Österreich
          </p>


          <h2>Zweck der Website</h2>

          <p>
            ennstal connect ist eine regionale
            Online-Community für Menschen aus dem
            Ennstal, der Obersteiermark und den
            umliegenden Regionen.
          </p>

          <p>
            Die Plattform dient insbesondere:
          </p>

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
            ennstal connect dient der Information,
            Vernetzung und Kommunikation von Menschen
            innerhalb einer regionalen Online-Community.
          </p>

          <p>
            Die Plattform soll Gemeinschaft,
            regionalen Austausch, gemeinsame Aktivitäten,
            Veranstaltungen und soziale Kontakte fördern.
          </p>


          <h2>Haftung für Inhalte</h2>

          <p>
            Die Inhalte dieser Website werden mit
            größtmöglicher Sorgfalt erstellt.
            Dennoch kann keine Gewähr für die
            Richtigkeit, Vollständigkeit und Aktualität
            sämtlicher Inhalte übernommen werden.
          </p>

          <p>
            Beiträge, Kommentare und sonstige Inhalte
            von Community-Mitgliedern geben nicht
            zwingend die Meinung des Betreibers wieder.
          </p>

          <p>
            Für selbst veröffentlichte Inhalte sind
            grundsätzlich die jeweiligen Nutzerinnen
            und Nutzer verantwortlich.
          </p>

          <p>
            Bei Bekanntwerden von rechtswidrigen
            Inhalten werden diese geprüft und
            gegebenenfalls im Rahmen der gesetzlichen
            Möglichkeiten entfernt.
          </p>


          <h2>Haftung für Links</h2>

          <p>
            Diese Website kann Links zu externen
            Websites Dritter enthalten.
          </p>

          <p>
            Auf deren Inhalte besteht kein Einfluss.
            Für die Inhalte externer Websites ist
            grundsätzlich der jeweilige Betreiber
            verantwortlich.
          </p>


          <h2>Urheberrecht</h2>

          <p>
            Die vom Betreiber erstellten Inhalte,
            Texte, Grafiken, Logos und Designs
            unterliegen den geltenden gesetzlichen
            Schutzbestimmungen.
          </p>

          <p>
            Eine Verwendung außerhalb der gesetzlichen
            Grenzen ist ohne Zustimmung des jeweiligen
            Rechteinhabers nicht gestattet.
          </p>


          <h2>Inhalte von Community-Mitgliedern</h2>

          <p>
            Registrierte Nutzerinnen und Nutzer können,
            abhängig von den verfügbaren Funktionen,
            eigene Inhalte, Beiträge, Kommentare,
            Bilder oder sonstige Informationen
            veröffentlichen.
          </p>

          <p>
            Für diese Inhalte ist grundsätzlich die
            veröffentlichende Person verantwortlich.
          </p>


          <p>
            Insbesondere untersagt sind:
          </p>

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


          <h2>Meldung rechtswidriger Inhalte</h2>

          <p>
            Rechtswidrige oder möglicherweise
            rechtsverletzende Inhalte können gemeldet
            werden an:
          </p>

          <p>
            <strong>
              eggermarco@gmx.net
            </strong>
          </p>

          <p>
            Bitte gib möglichst einen Link oder eine
            genaue Beschreibung des betreffenden
            Inhalts sowie den Grund der Meldung an.
          </p>


          <p>
            <strong>
              Stand: August 2026
            </strong>
          </p>

        </>
      )
    },


    /* =====================================
       DATENSCHUTZ
    ===================================== */

    datenschutz: {
      title: 'Datenschutzerklärung',

      body: (
        <>

          <h2>1. Verantwortlicher</h2>

          <p>
            Verantwortlich für die Verarbeitung
            personenbezogener Daten im Zusammenhang
            mit ennstal connect ist:
          </p>

          <p>
            <strong>Marco Egger</strong>
            <br />
            Waidbachstraße
            <br />
            8700 Leoben
            <br />
            Österreich
          </p>

          <p>
            E-Mail: eggermarco@gmx.net
          </p>


          <h2>2. Allgemeines zur Datenverarbeitung</h2>

          <p>
            Der Schutz deiner persönlichen Daten ist
            wichtig. Personenbezogene Daten werden
            nur verarbeitet, soweit dies für den
            Betrieb und die Bereitstellung der
            Community erforderlich ist oder eine
            entsprechende rechtliche Grundlage
            besteht.
          </p>


          <h2>3. Registrierung und Benutzerkonto</h2>

          <p>
            Bei der Registrierung können insbesondere
            folgende Daten verarbeitet werden:
          </p>

          <ul>
            <li>Vorname</li>
            <li>Nachname</li>
            <li>Geburtsdatum</li>
            <li>Nickname</li>
            <li>E-Mail-Adresse</li>
            <li>Passwort in technisch geschützter Form</li>
          </ul>

          <p>
            Diese Daten werden benötigt, um ein
            Benutzerkonto einzurichten und die
            Community-Funktionen bereitzustellen.
          </p>


          <h2>4. Profildaten</h2>

          <p>
            Abhängig von den Funktionen der Plattform
            können Informationen wie Nickname,
            Profilbild, Rolle innerhalb der Community,
            Community-Punkte oder Online-Status
            verarbeitet und innerhalb der Community
            angezeigt werden.
          </p>


          <h2>5. Anmeldung</h2>

          <p>
            Bei der Anmeldung werden die für die
            Authentifizierung erforderlichen Daten
            verarbeitet, um dein Benutzerkonto zu
            erkennen und einen sicheren Zugriff auf
            die Plattform zu ermöglichen.
          </p>


          <h2>6. Supabase</h2>

          <p>
            Für Funktionen wie Benutzerverwaltung,
            Authentifizierung und Datenbank kann
            ennstal connect den Dienst Supabase
            verwenden.
          </p>

          <p>
            Dabei können die für die Bereitstellung
            der jeweiligen Funktionen erforderlichen
            personenbezogenen Daten verarbeitet
            werden.
          </p>


          <h2>7. Hosting über Vercel</h2>

          <p>
            Diese Website kann über die Plattform
            Vercel bereitgestellt werden.
          </p>

          <p>
            Beim Aufruf einer Website können
            technisch notwendige Daten verarbeitet
            werden, beispielsweise:
          </p>

          <ul>
            <li>IP-Adresse</li>
            <li>Datum und Uhrzeit des Zugriffs</li>
            <li>aufgerufene Seiten</li>
            <li>technische Informationen zum Browser</li>
            <li>Informationen zum verwendeten Gerät</li>
          </ul>

          <p>
            Diese Daten können erforderlich sein,
            um die Website technisch bereitzustellen,
            Sicherheit zu gewährleisten und Fehler
            zu erkennen.
          </p>


          <h2>8. Cookies und technische Speicherung</h2>

          <p>
            Die Plattform kann technisch notwendige
            Speichermechanismen verwenden, damit
            Anmeldung, Sitzungen und bestimmte
            Funktionen der Website funktionieren.
          </p>

          <p>
            Falls zukünftig Analyse-, Marketing- oder
            sonstige nicht technisch notwendige
            Cookies eingesetzt werden, wird diese
            Datenschutzerklärung entsprechend
            ergänzt und gegebenenfalls eine
            erforderliche Einwilligung eingeholt.
          </p>


          <h2>9. Community-Inhalte</h2>

          <p>
            Wenn Mitglieder Beiträge, Kommentare,
            Bilder oder andere Inhalte veröffentlichen,
            können diese Daten innerhalb der Community
            für andere berechtigte Nutzer sichtbar
            sein.
          </p>

          <p>
            Bitte veröffentliche keine personenbezogenen
            Daten anderer Personen, wenn dafür keine
            entsprechende Berechtigung vorliegt.
          </p>


          <h2>10. Empfänger von Daten</h2>

          <p>
            Daten können an technische Dienstleister
            übermittelt oder dort verarbeitet werden,
            soweit dies für den Betrieb der Plattform
            erforderlich ist.
          </p>

          <p>
            Dazu können insbesondere Anbieter für
            Hosting und Datenbank- bzw.
            Authentifizierungsdienste gehören.
          </p>


          <h2>11. Speicherung und Löschung</h2>

          <p>
            Personenbezogene Daten werden grundsätzlich
            nur so lange gespeichert, wie dies für
            den jeweiligen Zweck erforderlich ist oder
            gesetzliche Aufbewahrungspflichten bestehen.
          </p>

          <p>
            Bei einer Löschung eines Benutzerkontos
            können Daten gelöscht oder – soweit
            erforderlich – entsprechend gesetzlicher
            Vorgaben weiter gespeichert werden.
          </p>


          <h2>12. Deine Rechte</h2>

          <p>
            Du hast im Rahmen der geltenden
            Datenschutzgesetze grundsätzlich das Recht
            auf:
          </p>

          <ul>
            <li>Auskunft über deine gespeicherten Daten</li>
            <li>Berichtigung unrichtiger Daten</li>
            <li>Löschung deiner Daten</li>
            <li>Einschränkung der Verarbeitung</li>
            <li>Widerspruch gegen bestimmte Verarbeitungen</li>
            <li>Datenübertragbarkeit, soweit anwendbar</li>
          </ul>

          <p>
            Wenn du eines dieser Rechte ausüben
            möchtest, kannst du dich per E-Mail
            an den Betreiber wenden.
          </p>


          <p>
            <strong>
              Kontakt:
            </strong>
            <br />
            eggermarco@gmx.net
          </p>


          <h2>13. Beschwerderecht</h2>

          <p>
            Wenn du der Ansicht bist, dass die
            Verarbeitung deiner personenbezogenen
            Daten gegen geltendes Datenschutzrecht
            verstößt, hast du grundsätzlich das Recht,
            dich bei einer zuständigen
            Datenschutzaufsichtsbehörde zu beschweren.
          </p>


          <h2>14. Datensicherheit</h2>

          <p>
            Es werden angemessene technische und
            organisatorische Maßnahmen eingesetzt,
            um personenbezogene Daten vor unbefugtem
            Zugriff, Verlust, Missbrauch oder
            unzulässiger Veränderung zu schützen.
          </p>


          <h2>15. Änderungen dieser Datenschutzerklärung</h2>

          <p>
            Diese Datenschutzerklärung kann angepasst
            werden, wenn sich Funktionen der Website,
            gesetzliche Anforderungen oder die Art
            der Datenverarbeitung ändern.
          </p>


          <p>
            <strong>
              Stand: August 2026
            </strong>
          </p>

        </>
      )
    },


    /* =====================================
       COMMUNITY-REGELN
    ===================================== */

    regeln: {
      title: 'Community-Regeln',

      body: (
        <>

          <h2>Willkommen bei ennstal connect</h2>

          <p>
            ennstal connect soll ein respektvoller,
            freundlicher und sicherer Ort für Menschen
            aus der Region sein.
          </p>


          <h2>1. Respektvoller Umgang</h2>

          <p>
            Behandle andere Mitglieder so, wie du
            selbst behandelt werden möchtest.
          </p>

          <p>
            Beleidigungen, Diskriminierung,
            Bedrohungen oder gezielte Belästigung
            sind nicht erlaubt.
          </p>


          <h2>2. Ehrliche Profile</h2>

          <p>
            Verwende bei der Registrierung
            wahrheitsgemäße Angaben.
          </p>

          <p>
            Fake-Profile oder das Vortäuschen einer
            falschen Identität können entfernt werden.
          </p>


          <h2>3. Datenschutz respektieren</h2>

          <p>
            Veröffentliche keine persönlichen Daten
            anderer Personen ohne deren Zustimmung.
          </p>


          <h2>4. Keine illegalen Inhalte</h2>

          <p>
            Es dürfen keine Inhalte veröffentlicht
            werden, die gegen geltendes Recht
            verstoßen.
          </p>


          <h2>5. Respektiere Urheberrechte</h2>

          <p>
            Lade nur Bilder, Texte oder andere Inhalte
            hoch, für die du die erforderlichen Rechte
            besitzt.
          </p>


          <h2>6. Kein Spam</h2>

          <p>
            Werbung, Spam, betrügerische Inhalte oder
            wiederholte unerwünschte Nachrichten sind
            nicht erlaubt.
          </p>


          <h2>7. Melden von Problemen</h2>

          <p>
            Problematische oder rechtswidrige Inhalte
            können dem Betreiber gemeldet werden:
          </p>

          <p>
            <strong>
              eggermarco@gmx.net
            </strong>
          </p>


          <h2>8. Maßnahmen bei Verstößen</h2>

          <p>
            Bei Verstößen gegen diese Community-Regeln
            können Inhalte entfernt, Funktionen
            eingeschränkt oder Benutzerkonten
            vorübergehend oder dauerhaft gesperrt
            werden.
          </p>


          <p>
            <strong>
              Stand: August 2026
            </strong>
          </p>

        </>
      )
    }

  };


  const page = content[type];


  return (

    <div className="legalBackdrop">

      <div className="legalModal">

        <button
          type="button"
          className="close"
          onClick={onClose}
        >
          ×
        </button>

        <h1>
          {page.title}
        </h1>

        {page.body}

      </div>

    </div>

  );
}


/* =========================================
   HAUPT-APP
========================================= */

function App() {

  const [query, setQuery] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);

  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [logs, setLogs] = useState([]);

  const [notice, setNotice] = useState('');
  const [legalPage, setLegalPage] = useState(null);


  const isAdmin =
    profile?.role === 'ADMIN' ||
    profile?.role === 'HEAD_ADMIN';


  const isHead =
    profile?.role === 'HEAD_ADMIN';


  async function load() {

    const { data } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        nickname,
        avatar_url,
        role,
        community_points,
        is_online,
        status
      `)
      .eq('status', 'APPROVED')
      .order('nickname');


    setMembers(data || []);


    if (isAdmin) {

      const { data: p } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          nickname,
          status,
          created_at
        `)
        .eq('status', 'PENDING_ADMIN')
        .order('created_at');


      setPending(p || []);

    }


    if (isHead) {

      const { data: l } = await supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', {
          ascending: false
        })
        .limit(20);


      setLogs(l || []);

    }

  }


  useEffect(() => {

    supabase.auth
      .getUser()
      .then(({ data }) => {
        setUser(data.user || null);
      });


    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );


    return () =>
      subscription.unsubscribe();

  }, []);


  useEffect(() => {

    if (!user) {
      setProfile(null);
      return;
    }


    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data || null);
      });

  }, [user]);


  useEffect(() => {

    load();

  }, [
    user,
    profile?.role
  ]);


  async function changeStatus(
    id,
    newStatus
  ) {

    const { error } =
      await supabase.rpc(
        'set_account_status',
        {
          target_user: id,
          new_status: newStatus,
          note: ''
        }
      );


    setNotice(
      error
        ? error.message
        : 'Mitglied aktualisiert.'
    );


    load();

  }


  async function changePoints(id) {

    const delta = Number(
      prompt(
        'Punkte eingeben, z.B. 5 oder -3:'
      )
    );


    if (!delta) return;


    const reason = prompt(
      'Begründung (Pflicht):'
    );


    if (
      !reason ||
      reason.trim().length < 3
    ) {

      setNotice(
        'Eine Begründung ist erforderlich.'
      );

      return;
    }


    const { error } =
      await supabase.rpc(
        'admin_change_points',
        {
          target_user: id,
          delta,
          change_kind:
            delta > 0
              ? 'PLUS'
              : 'MINUS',
          reason_text: reason
        }
      );


    setNotice(
      error
        ? error.message
        : 'Punkte erfolgreich geändert.'
    );


    load();

  }


  const filtered =
    members.filter(m =>
      `${m.nickname} ${m.first_name} ${m.last_name}`
        .toLowerCase()
        .includes(
          query.toLowerCase()
        )
    );


  const openAuth = mode => {

    setAuthMode(mode);
    setAuthOpen(true);

  };


  return (

    <div className="app">


      {authOpen && (

        <Auth
          initialMode={authMode}
          onClose={() =>
            setAuthOpen(false)
          }
        />

      )}


      {legalPage && (

        <LegalModal
          type={legalPage}
          onClose={() =>
            setLegalPage(null)
          }
        />

      )}


      <header>

        <div className="brand">
          🏔️
          <b>ennstal connect</b>
        </div>


        <nav>
          <a>Start</a>
          <a>Neuigkeiten</a>
          <a>Mitglieder</a>
          <a>Gruppen</a>
          <a>Events</a>
        </nav>


        <div className="headerActions">

          {user ? (

            <>

              <span className="welcome">

                {profile?.nickname ||
                  user.email}

                {profile?.is_online &&
                  profile?.role === 'HEAD_ADMIN' && (
                    <img
                      src="/admin-star.png"
                      alt="Hauptadmin"
                      className="headerRoleStar"
                    />
                  )}

                {profile?.is_online &&
                  profile?.role === 'ADMIN' && (
                    <img
                      src="/admin-star.png"
                      alt="Admin"
                      className="headerRoleStar"
                    />
                  )}

                {profile?.is_online &&
                  profile?.role === 'SUPPORTER' && (
                    <img
                      src="/supporter-star.png"
                      alt="Unterstützer"
                      className="headerRoleStar"
                    />
                  )}

              </span>


              <button
                className="ghost"
                onClick={() =>
                  supabase.auth.signOut()
                }
              >
                Abmelden
              </button>

            </>

          ) : (

            <>

              <button
                className="ghost"
                onClick={() =>
                  openAuth('login')
                }
              >
                Anmelden
              </button>


              <button
                className="primary"
                onClick={() =>
                  openAuth('register')
                }
              >
                Registrieren
              </button>

            </>

          )}

        </div>

      </header>



      <main>


        <section className="hero">

          <div className="mountains" />

          <div className="heroContent">

            <p className="eyebrow">
              WILLKOMMEN IN DER REGION
            </p>


            <h1>
              ennstal connect
            </h1>


            <p>
              Die regionale Community für
              Ennstal & Obersteiermark.
            </p>


            <button
              className="primary big"
              onClick={() =>
                openAuth('register')
              }
            >
              Community entdecken
            </button>

          </div>

        </section>



        {notice && (

          <section className="statusBanner">
            {notice}
          </section>

        )}



        {profile &&
          profile.status !== 'APPROVED' && (

          <section className="statusBanner">

            <b>
              Dein Konto ist noch nicht freigegeben.
            </b>

            {' '}

            Ein Admin prüft deine Registrierung.

          </section>

        )}



        <section className="toolbar">

          <div>

            <h2>
              Mitglieder
            </h2>

            <p>
              Finde Menschen aus deiner Region
              und bleibe verbunden.
            </p>

          </div>


          <input
            value={query}
            onChange={e =>
              setQuery(e.target.value)
            }
            placeholder="Mitglieder oder Nickname suchen ..."
          />

        </section>



        <section className="layout">

          <div className="content">

            <div className="grid">

              {filtered.map(m => {


                const isAdminMember =
                  m.role === 'ADMIN' ||
                  m.role === 'HEAD_ADMIN';


                const isSupporter =
                  m.role === 'SUPPORTER';


                const roleClass =
                  isAdminMember
                    ? 'admin'
                    : isSupporter
                    ? 'supporter'
                    : 'member';


                return (

                  <article
                    className={`card ${roleClass}`}
                    key={m.id}
                  >


                    <div className="avatar">

                      {m.avatar_url ? (

                        <img
                          src={m.avatar_url}
                          alt="Profilbild"
                        />

                      ) : (

                        m.nickname
                          ?.charAt(0)
                          ?.toUpperCase()

                      )}

                    </div>



                    <h3 className="memberNickname">

                      {m.nickname}


                      {isAdminMember &&
                        m.is_online && (

                        <img
                          src="/admin-star.png"
                          alt="Admin"
                          className="nicknameStar"
                        />

                      )}


                      {isSupporter &&
                        m.is_online && (

                        <img
                          src="/supporter-star.png"
                          alt="Unterstützer"
                          className="nicknameStar"
                        />

                      )}


                      <span>
                        ({m.community_points})
                      </span>

                    </h3>



                    <p>

                      {m.first_name}{' '}
                      {m.last_name}

                    </p>



                    <small
                      className={
                        m.is_online
                          ? 'online'
                          : 'offline'
                      }
                    >

                      {m.is_online
                        ? '● Online'
                        : '● Offline'}

                    </small>



                    {isAdmin && (

                      <button
                        className="smallAction"
                        onClick={() =>
                          changePoints(m.id)
                        }
                      >
                        Punkte ändern
                      </button>

                    )}


                  </article>

                );

              })}

            </div>

          </div>



          <aside className="side">


            {isAdmin && (

              <button
                className="adminToggle"
                onClick={() =>
                  setAdminOpen(!adminOpen)
                }
              >

                🔒 Admin-Bereich{' '}

                {adminOpen
                  ? '⌃'
                  : '⌄'}

              </button>

            )}



            {isAdmin &&
              adminOpen && (

              <div className="adminPanel">

                <h3>
                  Admin-Dashboard
                </h3>


                <b>
                  Neue Mitglieder ({pending.length})
                </b>


                {pending.map(p => (

                  <div
                    className="pending"
                    key={p.id}
                  >

                    <strong>
                      {p.nickname}
                    </strong>


                    <span>

                      {p.first_name}{' '}
                      {p.last_name}

                    </span>


                    <div>

                      <button
                        onClick={() =>
                          changeStatus(
                            p.id,
                            'APPROVED'
                          )
                        }
                      >
                        Freigeben
                      </button>


                      <button
                        onClick={() =>
                          changeStatus(
                            p.id,
                            'REJECTED'
                          )
                        }
                      >
                        Ablehnen
                      </button>

                    </div>

                  </div>

                ))}


                {!pending.length && (

                  <p>
                    Keine offenen Registrierungen.
                  </p>

                )}


                {isHead && (

                  <>

                    <hr />


                    <b>
                      Hauptadmin-Protokoll
                    </b>


                    {logs.map(l => (

                      <small
                        className="log"
                        key={l.id}
                      >

                        {new Date(
                          l.created_at
                        ).toLocaleString()}

                        {' · '}

                        {l.action}

                      </small>

                    ))}

                  </>

                )}

              </div>

            )}



            <div className="onlineBox">

              <h3>
                🟢 Gerade online
              </h3>


              <p>

                {
                  members.filter(
                    m => m.is_online
                  ).length
                }

                {' '}

                Mitglieder sind aktiv.

              </p>

            </div>


          </aside>

        </section>


      </main>



      {/* =====================================
          FOOTER
      ===================================== */}

      <footer className="siteFooter">

        <div>
          © 2026 ennstal connect ·
          Regional. Verbunden. Sicher.
        </div>


        <div className="footerLinks">

          <button
            onClick={() =>
              setLegalPage('impressum')
            }
          >
            Impressum
          </button>


          <button
            onClick={() =>
              setLegalPage('datenschutz')
            }
          >
            Datenschutz
          </button>


          <button
            onClick={() =>
              setLegalPage('regeln')
            }
          >
            Community-Regeln
          </button>

        </div>

      </footer>


    </div>

  );
}


createRoot(
  document.getElementById('root')
).render(<App />);
