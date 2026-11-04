# Testbericht – Round 2 (Tester, 2026-11-04)

Branch `tester` nach `git merge main` (enthält ux-responsive, premium-ui, social-classes).

## Automatische Checks
| Check | Ergebnis |
|---|---|
| `npm run lint` | grün (0 Probleme, `.claude/**` wird ignoriert) |
| `npm test` | 47/47 bestanden (inkl. SQL-Tests für Klassen/Social via pglite) |
| `next build` (Dummy-Env) | grün, 17 Routen, TypeScript ok |

Hinweis: `next build` mit Turbopack bricht in einem Worktree mit **symlinkter** `node_modules` ab ("Symlink points out of the filesystem root"). Das ist ein Worktree-Artefakt; in einem Repo mit echtem `node_modules` oder mit `--webpack` baut es fehlerfrei.

## Browser-Test (Headless Chromium, Playwright, Supabase gestubbt)
Viewports 375 und 1280 px, 20 Szenarien (Login, Dashboard, Bewerbungen, neu, Detail, Analytics, Lebensläufe, Suche, Profil, Einstellungen, Map, 404, Freunde, Einladung ein-/ausgeloggt, Klassen als Schüler/Lehrer, Klassen-Detail, Beitritt). Stub: Schüler-Session (Lena) und Lehrer-Session mit Klasse "Informatik 4a" (5 Schüler, einer ohne Freigabe).

- **Kein horizontaler Überlauf** auf allen Routen bei 375 und 1280 px (`scrollWidth - clientWidth = 0`).
- Genau ein `h1` pro Seite, keine Konsolenfehler ausser den unten genannten.
- Mobile Navigation: Tab-Bar (Start, Suchen, Bewerbungen, Freunde) navigiert korrekt; "Mehr"-Sheet enthält Map, Lebensläufe, Auswertung, Klassen, Profil, Einstellungen.
- Einladungsseite `/invite/CODE`: eingeloggt zeigt Einladender + "Als Freund hinzufügen"; ausgeloggt Weiterleitung auf `/login`.
- Freundesseite: eigener Code + Kopieren-Button, Freund, eingehende und ausgehende Anfrage sichtbar.
- Klassenübersicht (Lehrer): Filter Alle / Inaktiv (30 T) / Aktiv (7 T) / Mit Zusage / Teilt nicht, Sortierung (Wenigste Aktivität, Meiste Bewerbungen, Name) und Suche funktionieren; Klick auf Schüler öffnet die Detailansicht mit Bewerbungen. Schüler ohne Freigabe zeigt "Teilt keine Daten" ohne Zahlen.
- Schüler-Sicht `/classes` und Beitrittsseite `/classes/join/CODE` rendern korrekt.

## Beobachtungen (nicht behoben, kein Blocker)
1. `/map` in Headless-Chromium: bei 1280 px zeigt die Error-Boundary "Das hat nicht geklappt", weil dort kein WebGL verfügbar ist (bekannt, siehe frühere Session). Bei 375 px lädt die Seite (Listenansicht). Im echten Browser mit WebGL nicht betroffen.
2. `/map` mobil: Shop-Button zeigt "Shop · undefined", wenn `map_shop_state` leer zurückkommt (nur Stub-Artefakt; echte RPC liefert Zustand). Kleine Härtung möglich: `shop.state?.balance ?? 0` (Datei gehört zu premium-ui/`app/map`).
3. Nicht getestet: echte Supabase-Daten/RLS (nur SQL-Tests via pglite), Schreibaktionen gegen Backend, WebGL-Map, Web-Share-API.

## Screenshots
`~/Projects/bewerbungen-tracker-wt/screenshots/final/` (`<route>-375.png`, `<route>-1280.png`, `interact-*.png`, `report.json`).
Testskripte liegen ausserhalb des Repos in `~/Projects/bewerbungen-tracker-wt/audit-tools/` (`final.mjs`, `interact.mjs`).
