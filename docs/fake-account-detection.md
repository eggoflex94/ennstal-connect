# Fake-Account-Prüfung

Aktive Head Admins öffnen Fake-Erkennung und Admin-Logbuch über die beiden Symbole im persönlichen Dashboard-Menü. Beide haben eigene Ansichten und sind aus der normalen Admin-Zentrale einschließlich der bisherigen Logbuch-Vorschau entfernt. Die Fake-Erkennung lädt beim Öffnen automatisch; das Logbuch behält Suche, Zeitfilter und eine Aktualisieren-Schaltfläche. Normale Admins, Supporter und Mitglieder erhalten weder die Symbole noch Zugriff über die Navigation.

Die Head-Admin-Oberfläche zeigt eine erklärbare Prüfpriorität, keine Wahrscheinlichkeit und keinen Identitätsnachweis. Die Auswertung erfolgt serverseitig beim Öffnen und über „Neu prüfen“. Sperren bleiben manuelle Entscheidungen.

## Signale

| Signal | Punkte |
| --- | --- |
| 3 / 5 unabhängige meldende Mitglieder mit offenen Meldungen in 30 Tagen | 25 / 40 |
| Freundschaftsanfragen an 15 / 30 verschiedene Empfänger in 24 Stunden | 25 / 40 |
| Private Nachrichten an 10 / 20 / 40 verschiedene Empfänger in 24 Stunden | 20 / 35 / 50 |
| Unbestätigte E-Mail, nur bei vorhandenem Verhaltenssignal | +5 |
| Konto jünger als 7 Tage, nur bei vorhandenem Verhaltenssignal | +5 |

Maximal 100 Punkte, erhöhte Prüfpriorität ab 40. Profile ohne Verhaltenssignal erhalten 0. Fehlende Bilder, Verifizierung, Biografie oder Wohnort werden nicht bewertet. Nachrichteninhalte werden nicht untersucht. Punktebenachrichtigungen zählen nicht. Meldungen und Freundschaftsanfragen werden über alte und aktuelle Tabellen dedupliziert. Die Prüfung erkennt keine Identitätstäuschung allein anhand von Fotos oder Namen.

Auch bereits manuell geprüfte Konten erscheinen bei neuer erhöhter Priorität im Standardfilter. Suche und Filter zeigen maximal die 250 höchst priorisierten Treffer; bei Erreichen der Grenze erscheint ein Hinweis. Der Prüfstatus wird dadurch nicht automatisch geändert.

## Bereitstellung

Zuerst die geprüfte Funktion aus `supabase/fake_account_detection.sql` in Supabase übernehmen, anschließend die Oberfläche veröffentlichen. Die bestehende Funktionssignatur bleibt kompatibel. Keine neuen Tabellen oder automatischen Sperren. Die Migration `behavior_based_fake_account_detection` wurde am 10.09.2026 nach Freigabe übernommen. Ein schreibgeschützter Produktionstest bestätigt die Ausführung, gültige Score-Grenzen und den verweigerten Zugriff ohne Head-Admin-Berechtigung.

## Lokale Regressionstests

Abhängigkeiten ausschließlich in einem separaten Testverzeichnis installieren:

```sh
npm install --prefix work/fake-tests --save-exact @electric-sql/pglite@0.5.8 jsdom@30.0.1
node scripts/test-fake-account-database.mjs /absolute/path/to/work/fake-tests/package.json
node scripts/test-fake-account-interface.mjs /absolute/path/to/work/fake-tests/package.json
npm test
npm run build
```

Die Datenbanktests verwenden isoliertes PostgreSQL in PGlite und künstliche Tabellen/Konten: Normalfall, Empfängerzahlen, Deduplizierung, Ablauf alter Meldungen, Punktebenachrichtigungen und Zugriffsschutz. Die UI-Tests prüfen Einbindung, überholte Antworten, Text-Escaping, erneute Navigation und Abmeldung. Der Browserfluss für tatsächliche Sperren/Entsperrungen wurde nicht gegen echte Konten ausgeführt.

## Profilbesuche

Die abschließende, auf Besuchslisten begrenzte Darstellung lässt lange Namen und Hinweise umbrechen. Zeitangaben stehen unter der Identität; Zeilen und Profil-Timeline wachsen mit dem Inhalt. Auch die letzte der zehn Zeilen bleibt erreichbar. Die bestehende globale mobile Desktop-Ansicht bleibt erhalten.

`scripts/test-profile-visits-layout.mjs` prüft echte Browser-Geometrie mit dem gebauten CSS und künstlichen Besuchern bei 320, 390, 768, 1024 und 1440 Pixeln. Aufruf: `node scripts/test-profile-visits-layout.mjs /absolute/path/to/playwright-runtime/package.json` (Playwright und Microsoft Edge erforderlich).

`scripts/test-profile-visits-runtime.mjs` verwendet dieselbe isolierte jsdom-Installation wie die Fake-Account-Oberflächentests. Es prüft, dass unveränderte Einträge ihre Links und Datumsattribute behalten und dass eigene DOM-Aktualisierungen keine weiteren Datenbankabfragen auslösen.
