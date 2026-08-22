# ennstal connect – Architektur Phase 2

## Ziel
Von einer Demo-Oberfläche zu einer echten Community-Anwendung mit Datenbank, Anmeldung und Rechteverwaltung.

## Empfohlener Stack
- React + Vite: Oberfläche
- PostgreSQL: persistente Daten
- Server/API: Authentifizierung, Rollen, Punkte, Gruppen und Moderation
- Objekt-Speicher: Profil- und Gruppenbilder
- E-Mail-Dienst: Verifikation und Systembenachrichtigungen

## Rollen
- MEMBER
- SUPPORTER
- ADMIN
- HEAD_ADMIN

Reihenfolge in der Mitgliederliste: ADMIN/HEAD_ADMIN, SUPPORTER, MEMBER. Innerhalb der Kategorie alphabetisch nach Nickname.

## Registrierungsstatus
PENDING_EMAIL -> PENDING_ADMIN -> APPROVED oder REJECTED.

## Sicherheitsprinzipien
- Passwörter nur gehasht speichern.
- Rollen und Rechte serverseitig prüfen.
- Administrative Aktionen protokollieren.
- Manuelle Punkteänderungen benötigen immer eine Begründung.
- Nach jeder manuellen Punkteänderung erhält das Mitglied eine Benachrichtigung mit Änderung und Grund.
- Die konkrete Verarbeitung von IP- und Sicherheitsdaten wird vor dem Livegang datenschutzrechtlich geprüft und auf das notwendige Minimum beschränkt.

## Nächste Implementierung
1. Datenbank und Authentifizierungsanbieter verbinden.
2. Registrierung mit E-Mail-Verifikation implementieren.
3. Admin-Freigabe implementieren.
4. Demo-Mitglieder durch echte Daten ersetzen.
