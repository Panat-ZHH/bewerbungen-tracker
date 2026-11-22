# Eltern-Dorf «stillgelegt» – Analyse und Fix (2026-11-22)

Branch `fix/parent-village-live` (Basis `origin/main` = af82f8a = aktueller Produktions-Deploy vom 21.11. 21:59 UTC).
Nicht gepusht, nicht deployed.

## Ursache

**Kurz:** Die 3D-Welt lief in der Eltern-Ansicht schon vorher (Bewohner, Bauarbeiter, Wasser, Feuer/Rauch und Tag/Nacht
funktionierten). Wenn das Kind seine Bewerbungsliste **nicht** teilt, versteckte die Eltern-Ansicht aber **alle Hausschilder**.
Ohne die Schilder «Haus N · Status» wirkte das Dorf leer und «stillgelegt». Die Freunde-Ansicht zeigt im gleichen Fall
neutrale Schilder «Haus 1 · Abgeschickt», «Haus 4 · Absage erhalten» usw.

Genau das ist der reale Fall: Das einzige aktive Kind in Produktion teilt das Dorf (`village = true`), aber nicht die
Bewerbungen (`applications = false`). Geprüft wurde das read-only und nur mit aggregierten Daten, ohne Namen oder IDs.
Das Kind hat 25 Häuser, 4 Inseln und 16 Shop-Objekte.

Zwei Stellen haben das zusammen verursacht (Stand af82f8a):

- `lib/family-village.ts:39` (alt): `company: (showCompanies && cleanCompany(h.company)) || ""`. Ohne geteilte Firmen bekam
  jedes Haus ein **leeres** Label. Die Freunde-Ansicht (`lib/friend-island.ts:29`) setzt dagegen `houseLabel(index)` = «Haus N».
- `app/familie/kind/[id]/dorf/dorf.module.css:4` (alt): `.village [data-building]:has(> strong:empty) { display: none; }`.
  Diese Regel versteckte jedes Hausschild mit leerem Namen, also im realen Fall **alle**, samt Statuszeile.

Zusätzlich hatten Eltern- und Freunde-Seite je eine **eigene Kopie** des Kartenscreens (`app/familie/kind/[id]/dorf/page.tsx`
und `components/friends/friend-island-view.tsx`, ca. 60 Zeilen fast identisches JSX). Solche Abweichungen konnten deshalb
unbemerkt entstehen.

Was ich ausgeschlossen habe (Messung mit `scripts/parent-village-live-e2e.mjs`: Render-Loop-Frames pro Sekunde und zwei
Canvas-Frames im Abstand von 1,5 s):

- Ein Pausen-, readOnly- oder reduced-motion-Flag gibt es nicht. Beide Seiten rendern `ApplicationMapWorld` mit identischen Props.
  Die Animation hängt nur an `prefers-reduced-motion` des Geräts, und das gilt für beide Ansichten gleich.
- Datenform: Die produktive RPC `family_child_village` liefert alle Vertragsschlüssel (`houses`, `layouts`, `items` mit
  `itemType` usw.). Das habe ich in der Produktions-DB per Funktionsdefinition geprüft.
- Produktions-Bundle: Ich habe wendapply.ch mit Playwright aufgerufen und alle Supabase-Aufrufe im Browser auf Demo-Daten
  umgeleitet. Die Form entsprach dem realen Dorf (25 Häuser, 4 Inseln, Autos und Scooter). Beide Ansichten liefen mit 16–39 fps,
  die Frames unterschieden sich, sowohl auf Desktop als auch auf Mobile und sowohl direkt als auch über «Dorf ansehen».
- Der Service Worker cached Seiten network-first und `/_next/static` cache-first mit Hash, also nichts Veraltetes.

## Fix

1. **Ein gemeinsamer Screen für beide Ansichten:** `components/applications/read-only-village-view.tsx` (`ReadOnlyVillageView`).
   Er enthält die 3D-Welt, Kamera, Tag/Nacht, den Insel-Umschalter, das Info-Chip und das Badge «Nur ansehen».
   `components/friends/friend-island-view.tsx` und `app/familie/kind/[id]/dorf/page.tsx` laden nur noch ihre Daten (jeweils
   über die eigene read-only RPC mit eigener Datenschutzprüfung) und übergeben die Texte.
2. **Gleiche Map-Props:** `lib/read-only-village.ts` mit `readOnlyWorldProps()` (readOnly, `lockedDrag`, alle Handler no-op,
   nichts auswählbar oder platzierbar) und `houseLabel()`. `lib/friend-island.ts` nutzt dasselbe `houseLabel`.
3. **Gleiche Labels:** `parseFamilyVillage` setzt ohne geteilte Firmen «Haus N» statt `""`
   (`lib/family-village.ts`). Die CSS-Regel, die Schilder versteckte, ist entfernt (`dorf.module.css`).
4. Vertrags-Doku angepasst (`docs/family/parent-village-contract.md`, Änderung 3).

Datenschutz bleibt unverändert: Die Firmennamen erscheinen nur, wenn das Kind die Bewerbungen teilt. Der Status pro Haus kam
schon vorher von der RPC und ist ohnehin an der Gebäudeform sichtbar (Baustelle, Ruine, Palast). Es gibt keine Migration und
keine neue RPC. Die Eltern-Seite ruft weiterhin nur `family_child_village` auf. Es gibt keinen Shop, keine Münzen, kein
Bearbeiten und kein Ziehen.

## Tests

- **Neu, `tests/read-only-village.test.mjs`:**
  - Parität: Dasselbe Dorf einmal als `map_friend_island` und einmal als `family_child_village` ergibt dieselben Map-Props und
    dieselben Haus-, Strassen- und Bewohner-Routen-Positionen. Geprüft für beide Fälle, mit und ohne geteilte Firmen.
  - Kein Haus hat ein leeres Label.
  - Die read-only Props sind gesperrt.
  - Beide Seiten nutzen `ReadOnlyVillageView`.
  - Keine CSS-Regel versteckt Schilder, und es gibt keinen zusätzlichen Motion- oder Pause-Schalter.
- **Neu in `tests/family-child-village-db.test.mjs`** (PGlite, ganze Migrationskette): Datenschutz-Gate. Ein aktiver Elternteil
  sieht das Dorf. Ein entfernter (inaktiver) Elternteil bekommt FORBIDDEN oder NOT_IN_FAMILY. Wenn das Kind nicht teilt, kommt
  NOT_SHARED. Schon vorher abgedeckt waren: Nicht-Eltern (das Kind selbst, fremde Kinder, Aussenstehende, anon), ein
  pending-Elternteil, eine andere Familie, Einwilligung ausstehend oder widerrufen und ein entferntes Kind.
- **Angepasst:** `tests/family-village.test.mjs` erwartet jetzt «Haus N» und `ReadOnlyVillageView`. In
  `scripts/family-village-e2e.mjs` hat ein Haus ohne Firma jetzt das Schild «Haus 3» (54/54 Checks bestanden).
- **Neu, `scripts/parent-village-live-e2e.mjs`:** Live-Check mit Demo-Daten. Er vergleicht Freunde- und Eltern-Dorf (direkt
  und über «Dorf ansehen», Desktop und Mobile) anhand von fps und unterschiedlichen Frames. Optional bildet `SHAPE=<json>`
  die anonyme Form eines realen Dorfs nach, und `NOCO=1` simuliert «Firmen nicht geteilt». Ergebnis lokal: alle 6 Messungen
  live, und die Screenshots von Eltern- und Freunde-Dorf sind identisch, mit «Haus N»-Schildern.
- **Checks:**
  - `npm run lint`: 0 Fehler. Die 16 Warnungen sind alt und stehen in Dateien, die ich nicht angefasst habe.
  - `npx tsc --noEmit`: grün.
  - `npm test`: 1251 bestanden, 0 fehlgeschlagen, 12 übersprungen.
  - `npm run build`: grün.

Hinweis: Falls jemand das Dorf weiterhin «eingefroren» sieht, obwohl die Schilder da sind, liegt es am Gerät. Bei aktivierter
Einstellung «Bewegung reduzieren» (macOS/iOS) bewegt sich die Karte bewusst nicht, in beiden Ansichten.
