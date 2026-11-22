# Eltern-Dorf live – E2E-Test (Tester, 2026-11-22)

Branch `fix/parent-village-live` (Fix-Commit d8d2b03), lokaler **Produktions-Build** (`npm run build` + `npx next start -p 3418`)
gegen das **echte** Supabase-Projekt `bhwreehwirrloxagyypi` mit **temporären Probe-Usern** (alle wieder gelöscht, siehe unten).
Nichts gepusht, nichts deployed. Keine echten Nutzer angefasst.

## 1. Checks

| Befehl | Ergebnis |
|---|---|
| `npm run lint` | PASS – 0 Fehler, 16 Warnungen (alt, in nicht geänderten Dateien) |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS – 1263 Tests: 1251 bestanden, 0 fehlgeschlagen, 12 übersprungen (Live-RLS-Audit ohne Env) |
| `npm run build` | PASS |

## 2. E2E mit Probe-Usern (Playwright, Chrome mit SwiftShader-WebGL)

Skript: `/tmp/pvl/real-e2e.mjs` (bewusst nicht committet; Service-Key per `sb privat projects api-keys`, nie ausgegeben).

**Setup:** 4 Probe-User `pvl-e2e-{parent,child,friend,outsider}-<stamp>@example.com`.
- Kind: 8 Bewerbungen (alle Status), 2. Insel (`map_islands`, island_no 2), Familie mit Elternteil beigetreten,
  Teilen = `{progress: true, applications: false, village: true}` (= realer Fall: Dorf geteilt, Firmen nicht).
- Freundin: echte Freundschaft mit dem Kind (`social_send_request` / `social_respond_request`) → sieht **dasselbe Dorf** über `/friends/<kind>`.
- Aussenstehende:r: kein Bezug zum Kind.

### API (Datenschutz-Gate der RPC `family_child_village`)
- PASS aktiver Elternteil bekommt das Dorf: 8 Häuser, 2 Inseln, `show_companies = false`, **keine** Firmennamen im Payload
- PASS Freundin (kein Elternteil) → `NOT_IN_FAMILY`
- PASS Aussenstehende:r → `NOT_IN_FAMILY`
- PASS das Kind selbst → `FORBIDDEN`
- PASS anonym → `permission denied for function family_child_village`

### Freunde-Dorf vs. Eltern-Dorf (gleiches Kind-Dorf)
Messung: 3 s warten, dann zwei Canvas-Frames im Abstand von 2 s; `__map.stats.frames` (Render-Loop-Zähler) vorher/nachher;
Pixel-Diff mit sharp (Pixel mit RGB-Summen-Differenz > 24).

| Ansicht | Viewport | Render-Frames in ~2 s | fps* | geänderte Pixel | Insel-Wechsel | Haus ziehen | Console-Fehler | Schreib-Requests |
|---|---|---|---|---|---|---|---|---|
| Freund | 1440×900 hell | 56 | 3,4 | 39 955 (3,32 %) | 2 Inseln, Kamera bewegt | unverändert | 0 | 0 |
| Eltern | 1440×900 hell | 56 | 3,5 | 42 318 (3,52 %) | 2 Inseln, Kamera bewegt | unverändert | 0 | 0 |
| Freund | 1440×900 dunkel | 56 | 3,7 | 42 338 (3,52 %) | ok | unverändert | 0 | 0 |
| Eltern | 1440×900 dunkel | 56 | 3,7 | 39 814 (3,31 %) | ok | unverändert | 0 | 0 |
| Freund | 390×844 hell | 34 | 10,3 | 10 158 (3,31 %) | ok | unverändert | 0 | 0 |
| Eltern | 390×844 hell | 34 | 9,9 | 9 587 (3,13 %) | ok | unverändert | 0 | 0 |
| Freund | 390×844 dunkel | 32 | 10,7 | 11 723 (3,82 %) | ok | unverändert | 0 | 0 |
| Eltern | 390×844 dunkel | 37 | 11,2 | 10 301 (3,36 %) | ok | unverändert | 0 | 0 |
| Eltern via «Dorf ansehen» (/familie) | 1440×900 hell | 56 | 3,7 | 37 096 (3,09 %) | – | unverändert | 0 | 0 |

\* fps = Frames / gemessene Zeit inkl. Screenshot-Aufnahme, mit Software-WebGL (SwiftShader). Die niedrigen Desktop-Werte
liegen an der Software-Emulation und sind in **beiden** Ansichten identisch. Entscheidend: Die Render-Loop läuft, und die Frames unterscheiden sich.

Pro Ansicht zusätzlich geprüft (alle PASS, in allen 8 Kombinationen):
- Badge «Nur ansehen» vorhanden. Keine Texte oder Buttons «Shop», «Münzen», «Coins», «Kaufen», «Bearbeiten», «Platzieren», «Verschieben» oder «Freischalten».
- Haus ziehen: Ein echtes Haus wurde auf dem Bildschirm gegriffen und 150 px gezogen (Desktop per Maus, Mobile per Touch mit Long-Press).
  Die Weltposition des Hauses blieb unverändert, der Drag-Hinweis lautet «Nur ansehen: Ziehen bewegt die Kamera …», und es gab keinen
  einzigen Schreib-Request (POST/PATCH/DELETE oder schreibende RPC).
- Insel-Wechsel: Der Chip «Inseln» zeigt 2 Buttons, und ein Klick auf Insel 2 bewegt die Kamera.
- `prefers-reduced-motion` war aus. Hell und dunkel wurden per `colorScheme` plus `wendapply-theme` gesetzt.
- Console-Fehler und Page-Errors: **keine** in allen 9 Dorf-Ansichten.

Bemerkung (kein Bug): Beide Ansichten zeigen neutrale Schilder «Haus N». Der Status pro Haus kann sich unterscheiden: Die Freundin sieht z. B.
«Haus 3 · Abgeschickt», der Elternteil «Haus 3 · Zusage». Grund: Ergebnisse teilt man unter Freunden separat
(`social_share_outcomes`, Standard aus). Beim Elternteil kommt der Status laut Vertrag immer mit, siehe `PARENT-VILLAGE-LIVE.md`.

### Datenschutz-Gate in der UI (`/familie/kind/<kind>/dorf`)
| Wer | Ergebnis |
|---|---|
| Freundin (kein Elternteil) | PASS – Zustand `not_allowed`, «Dorf nicht verfügbar», kein Canvas, RPC 400 `NOT_IN_FAMILY` |
| Aussenstehende:r | PASS – `not_allowed`, «Dorf nicht verfügbar», kein Canvas, RPC 400 `NOT_IN_FAMILY` |
| Kind selbst | PASS – `not_allowed`, «Dorf nicht verfügbar», kein Canvas, RPC 400 `FORBIDDEN` |
| Nicht angemeldet | PASS – Redirect auf `/login?next=%2Ffamilie%2Fkind%2F…%2Fdorf`, kein RPC-Aufruf, kein Canvas |
| Elternteil, nachdem das Kind das Dorf-Teilen ausgeschaltet hat | PASS – `not_shared`, «Dorf nicht geteilt», kein Canvas, RPC 400 `NOT_SHARED` (`village_off`) |

In den Gate-Fällen protokolliert der Browser die erwartete Ablehnung als Console-Eintrag «Failed to load resource: 400».
Das ist die gewollte Antwort der RPC und kein App-Fehler. In den Dorf-Ansichten gab es keine Console-Fehler.

## 3. Screenshots

Ordner `_onboarding/screens/parent-village-live/` (40 Dateien):
- `{friend,parent}-{desktop,mobile}-{light,dark}.png`: ganze Seite
- `…-frameA.png` / `…-frameB.png`: die zwei Canvas-Frames für den Pixel-Diff (2 s Abstand)
- `…-island2.png`: nach dem Wechsel auf Insel 2
- `parent-desktop-light-via-link*.png`: Eltern-Dorf über «Dorf ansehen» auf /familie
- `gate-{friend-not-parent,outsider,child-self,anonymous,parent-village-off}.png`: Datenschutz-Gate

## 4. Probe-User: Aufräumen

Angelegt (letzter Lauf): 4 Auth-User `pvl-e2e-*@example.com`, 1 Familie «PVL Familie», 8 Bewerbungen, 1 Insel-Zeile und 1 Freundschaft.
Auch die zwei Läufe davor (Testskript-Anpassungen, siehe unten) haben je 4 User angelegt und genauso gelöscht.
- PASS Probe-Familie gelöscht (`families`)
- PASS alle 4 Probe-User gelöscht (`auth.admin.deleteUser`). Bewerbungen, Inseln und Freundschaft wurden vorher explizit bzw. per Cascade entfernt.
- PASS verifiziert: `getUserById` findet keinen der 4 User mehr. 0 Probe-Bewerbungen und 0 Probe-Familien übrig.
  **Kein** `pvl-e2e-*`-Konto mehr in `auth.users`, geprüft nach jedem der 3 Läufe.

## 5. Ablauf / Hinweise

- Lauf 1 und 2 schlugen wegen **Testskript-Fehlern** fehl, nicht wegen der App:
  - Eine fps-Schwelle von 5 war mit Software-WebGL auf 1440×900 unrealistisch und ist ersetzt durch «Render-Frames steigen und Pixel ändern sich».
  - `__map.movableAt()` ist nur ein Hit-Test und prüft die Drag-Sperre nicht. Ersetzt durch einen echten Drag-Versuch auf ein Haus.
  - Die Freunde-RPC liefert eigene (opake) Haus-IDs. Die IDs kommen jetzt aus `[data-building]`.
- Die Screenshots aus Lauf 1 habe ich versehentlich mit `rm` statt in den Papierkorb gelöscht. Es waren nur eigene, neu erzeugte
  Testbilder. Die aus Lauf 2 liegen in `~/.Trash/pvl-run2-screens/`.
- **Keinen App-Bug gefunden.** Freunde- und Eltern-Dorf verhalten sich identisch: live, nur lesen, Insel-Wechsel. Der Datenschutz ist eingehalten.

E2E: PASS
