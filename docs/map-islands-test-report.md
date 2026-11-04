# Map / Inseln / Zusage – Integrationstest (Branch map-test)

Stand: 2026-11-04. Gemergt: `map-bugs` (fast-forward), `islands`, `zusage-rename` auf main a053ebc.

## Merge
- `islands` + `map-bugs` kollidierten in `app/map/page.tsx` und `components/applications/application-map-world.tsx`
  (Props-Zeile, `zoom()`-Methode). Gelöst: beide Features bleiben (`onZoomChange`, stabile `visibleIds`/`noItems`/`noLayouts`
  **und** `islandCount`/`islandFocus`/`focusIsland`).
- `zusage-rename` ohne Konflikt. Strassen bleiben unverschiebbar (lock-streets unverändert).

## Automatische Prüfungen
| Prüfung | Ergebnis |
|---|---|
| `npm install` | ok |
| `npm run lint` | 0 Fehler (1 Warnung `fs` unused in `scripts/islands-e2e.mjs` behoben) |
| `npm run build` (Dummy-Env) | ok, alle 20 Routen |
| `npm test` | 56/56 grün (inkl. islands, zusage-rename, lock-streets) |
| `Angebot` im Code | nur in `tests/zusage-rename.test.mjs`, `docs/zusage-rename.md` und im Testskript (bewusst, siehe `docs/zusage-rename.md`); kein "Angebot" im Build-Output `.next` |

## Browser-Test (headless Chrome, WebGL/SwiftShader, gemocktes Supabase)
Skript: `scripts/map-integration-e2e.mjs` (Production-Build via `next start`). Desktop 1440x900 und Mobil 390x844 (Touch). **30/30 Checks grün.**
Pro Viewport: Karte lädt (WebGL) · Klick-Platzieren setzt Position · Baum kaufen + platzieren · Haus per Dialog verschieben (Layout gespeichert) ·
Gegenstand einlagern (= von der Karte entfernen) · Inselbutton aktiv bei 3500 Punkten · Insel 2 freischalten mit Animation (Punkte 3460 -> 2860) ·
Gegenstand auf neuer Insel platzieren (x=45) · Brückenfeld (x=35,z=9) nicht platzierbar · Reload: Insel bleibt, Umschalter "Ostinsel" da (Mock-Zustand) ·
"Zusage" sichtbar und kein "Angebot" auf /map, /applications, /dashboard, /analytics (Status-Filter, Kennzahlen, Diagramme) · keine Konsolenfehler.
Screenshots: `~/Projects/bewerbungen-tracker-wt/screenshots/map/final-{desktop,mobile}-*.png`.

## Gefunden / Hinweise
- Keine Produktfehler gefunden, keine Codekorrekturen nötig (nur Testskript-Anpassungen).
- Mobil: das Shop-Sheet öffnet sich nach jedem Platzieren wieder (shopOpen bleibt true) und verdeckt dann die Karte; die Aktionen "Verschieben/Einlagern" des gewählten Gegenstands liegen unterhalb des Falzes im Sheet. UX-Wunsch, kein Fehler: Sheet nach dem Platzieren geschlossen lassen.
- Testumgebung: Port 3150 wurde von einem anderen Agenten (resp-core) belegt und lieferte alte Seiten ("Angebot"); finaler Lauf auf Port 3187. Dev-Server (`next dev`) war mit SwiftShader und Last 25 instabil, deshalb Production-Build.
- Offen (aus map-bugs/islands): Migrationen (lock_streets, islands) nicht auf echter DB angewendet/getestet; serverseitige Grenzen von `map_shop_place`/`map_move_object` vs. Client (#9); Zusage-Wording nicht in Migrations-Kommentaren.
