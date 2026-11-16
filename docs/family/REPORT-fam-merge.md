# Familien / Privatkunden – Merge-Bericht (2026-11-16)

Branch `feature/pwa`: Merges `fam-db` (b2bbb99), `fam-app` (351a7c4), `fam-site` (997bcc2), Integrationsfix 145dc8c.
Nichts gepusht, nichts in Produktion, Migration `supabase/migrations/20261116140000_family_accounts.sql` NICHT auf der Live-DB.

## Vertrags-Abgleich App ↔ Migration (behoben in 145dc8c)
- Warteliste: App schickte `kind = "independent"`, die DB erlaubt nur `family|parent|student|school|other` → jetzt `student`.
- `family_child_overview`: App las `total`, `level`, `points`; die DB liefert `applications_total`, `islands`, `points_earned` → Reader angepasst
  (Anzeige «3 Inseln · 7 Gebäude · 420 Punkte» statt einer immer gleichen «Stufe 1»).
- Fehler: die DB wirft Codes (`FAMILY_SEAT_LIMIT`, `INVITE_WRONG_ACCOUNT_TYPE`, `NOT_A_PARENT`, …) mit deutschem `detail` → `familyError`
  zeigt das `detail`, sonst die bisherige Zuordnung. Tests mit den echten Codes ergänzt.
- Alle übrigen RPC-Namen/Parameter stimmen überein.

## Tests
- `npm run build` ok, `npx tsc --noEmit` ok, `npm run lint` 0 Fehler (9 alte Warnungen).
- `npm test` 544/544 (inkl. `tests/family-db.test.mjs`: alle Migrationen auf PGlite, Elternteil erstellt Familie → lädt Kind ein →
  Kind tritt bei → Einwilligung → Übersicht; zweite Familie sieht nichts von der ersten; Platzlimit; Export/Löschung).
- `scripts/family-app-e2e.mjs` 116/116.
- `scripts/e2e-all.mjs` 800 pass / 44 fail; alle fehlschlagenden Flows (application-crud, analytics-cvs, classes-*, friend-island,
  mobile navigation, avatar dark, teacher-e2e) schlagen auf dem Stand vor dem Merge (dd53376) identisch fehl → keine Regression.
- Lokales Supabase nicht möglich (kein Docker auf dem Mac); PGlite deckt den Ablauf ab.

## Vorschau
https://fam-preview--bewerbungen-pawat.netlify.app (Draft-Alias, nicht Produktion). Nutzt die Live-DB ohne Familien-Migration:
App-Teil zeigt deshalb «bald verfügbar», die Warteliste fällt auf E-Mail zurück.

## Offene Entscheide
Preis Familienpaket · Altersgrenze Einwilligung 16 bestätigen · Migration live nur nach Freigabe · Stripe später.
