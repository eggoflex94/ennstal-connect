# Ennstal Connect

Community-Webseite für Ennstal & Obersteiermark.

## Start
1. `.env.example` nach `.env` kopieren.
2. Supabase URL und Publishable Key eintragen.
3. `npm install`
4. `npm run dev`

## Hosting
- Cloudflare: Build-Befehl `npm run build`, Ausgabeordner `dist`.
- Die Anwendung wird mit `wrangler.json` als Single-Page-App ausgeliefert.
- In Cloudflare dieselben `VITE_SUPABASE_*` Variablen setzen.

## Datenbank
`supabase.sql` ist ein sicherer Ausgangspunkt. Nicht blind über eine bestehende Produktionsdatenbank laufen lassen: Dein vorhandenes Frontend verwendet zusätzliche Tabellen und RPCs, die vor einer destruktiven Migration abgeglichen werden müssen.


## Final Community Fix

Für die reparierten Funktionen liegt jetzt **`supabase/final_community_fix.sql`** im Repository. Dieses SQL einmal vollständig im Supabase SQL Editor ausführen. Es repariert/erstellt die Funktionen für Registrierung, Head Admin, Sperren/Freischalten mit Grund, gesperrte Nutzer, Nachrichten als gelesen, Onlinezeit/Belohnungen, Rollen, Admin-Berechtigungen und Admin-Logbuch.
