# Job- und Lehrstellensuche – Filter-Kern (`lib/job-filters`)

Reine TypeScript-Module (keine React-/Next-Importe), per `node --experimental-strip-types` testbar. Vertrag: `types.ts`.

| Modul | Zweck |
|---|---|
| `query.ts` | `normalize`/`fold` (Umlaute, ä=ae=a), `tokenize` (Stoppwörter, „/in“, „(m/w/d)“), `expandQuery` (Synonymgruppen Lehrstelle/Lehre/EFZ/EBA/Ausbildung/Stift, Praktikum/Stage, Teilzeit, Informatiker/Fachmann Information, Kauffrau/Kaufmann, Detailhandel, FaGe, … plus Städtenamen DE/FR/EN), Tippfehlertoleranz (Edit-Distanz 1 ab 4, 2 ab 8 Zeichen), `queryVariants` für Server-Suchen |
| `rank.ts` | `rankJobs(jobs, state, now)` → `RankedJob[]`: Titel 1.0 > Firma 0.6 > Ort 0.5 > Snippet 0.25; exakt > Präfix > Teilstring > Tippfehler; Synonym ×0.8; Phrasen-Bonus; Aktualität (≤0.15); stabil. Alle Begriffe sind UND-verknüpft, Treffer mit < 50 % der Begriffe fallen weg. `highlightSegments(text, ranges)` für die UI |
| `filter.ts` | `applyJobFilters(jobs, filters, {strict, now, savedUrls})`. Fehlende Daten bleiben drin, ausser `strict: true` oder `strict: { cantons: true }`. `passes()` einzeln für Facetten. Umkreis: wendet nur `distanceKm`/`inPlace` der Such-API an (siehe unten) |
| `geo.ts` | Frühere Helfer (`resolveLocation`, `plzToCanton`, `distanceKm`, `CANTONS`) – delegieren an `lib/geo` (amtliches Ortschaftenverzeichnis). Nur Server/Tests; der Browser nutzt `lib/geo/cantons.ts` |
| `taxonomy.ts` | Branchen (`FIELDS`), Labels (DE), `classifyJob` (Pensum „80-100 %“, EFZ/EBA/BM/HF/FH/Uni, Lehrbeginn 2027, Homeoffice/Remote, Sprache, Typ), `enrichJob` (Provider-Felder gewinnen, Rest wird abgeleitet; gecacht) |
| `dedupe.ts` | `dedupeJobs`: gleiche URL oder gleiche Firma+Titel(+Ort/Jahr) quellenübergreifend, behält alle Quellenlinks und Zusatzfelder |
| `url.ts` | `stateToParams`/`paramsToState`, kurze Schlüssel: `q k l r c t wn wx f y e g co s p rm sm on hs so`; Defaults weggelassen, ungültige Werte verworfen |
| `storage.ts` | Letzte Suchen (max. 8) und Presets in `localStorage` (`wendapply.jobsearch.recent/presets`), SSR-sicher, Storage injizierbar |
| `facets.ts` | `computeFacets`: Zähler pro Filterwert, disjunktiv (eigene Auswahl zählt nicht mit) |
| `sort.ts` | `sortJobs(ranked, sort)`: relevance/distance/newest/company/location/start, Fehlendes zuletzt, stabil |
| `index.ts` | Barrel + `searchJobs(jobs, state, options)` = dedupe → filter → rank → sort (+ Facetten) |

Tests: `tests/job-filters-core.test.mjs`.

## Ort-Suche (`lib/geo`, `lib/job-search.ts`)

**Eine Kette für alles** (Such-API, Freitext „Informatiker Zürich“, Ort-Filter, Autovervollständigung): Ortstext normalisieren → Ortschaft im Verzeichnis → Koordinaten → Distanz. Einstieg ist immer `geocode()` in `lib/geo/places.ts`.

| Datei | Zweck |
|---|---|
| `lib/geo/localities-data.ts` | Generiert: 4073 Ortschaften (Name, PLZ, Kanton, Koordinaten WGS84, Gemeindenummer) + 2119 Gemeindenamen, ca. 190 KB. Nicht von Hand ändern |
| `scripts/build-geo-localities.mjs` | Generator: lädt das CSV (oder nimmt einen Pfad), LV95 → WGS84, pro (Ortschaft, PLZ) die Zeile mit dem grössten Adressanteil |
| `lib/geo/places.ts` | `geocode`, `distanceKm`, `samePlace`, `withinRadius`, `localitiesWithin`, `placeNamesWithin`, `cantonsWithin`, `suggestPlaces`, `splitCompanyPlace`, `locateListing`. **Nur Server/Tests** (importiert das ganze Verzeichnis) |
| `lib/geo/cantons.ts` | 26 Kantone, `cantonInText`, `cantonFromName` – ohne Daten, darf in den Browser |
| `lib/job-query-parse.ts` | `splitPlace`: Ort am Ende des Suchtexts, gleiche Auflösung wie der Filter. Läuft in der Such-API |
| `app/api/places/route.ts` | `GET /api/places?q=` → max. 8 Vorschläge `{ name, plz, canton, label, value }` |

**Datenquelle:** swisstopo, „Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter“ (CSV, LV95), <https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip>. Offene Behördendaten (OGD): freie Nutzung, auch kommerziell, mit Quellenangabe „Quelle: Bundesamt für Landestopografie swisstopo“. Stand der Datei: 2026-10-29, erzeugt am 2026-11-11. Aktualisieren: `node scripts/build-geo-localities.mjs` (braucht `unzip`), danach `npm test`.

**Normalisierung** (`geocode`): „8610 Uster“, „CH-8400 Winterthur“, „Winterthur ZH“, „Buchs (SG)“, „Rothenburg / Luzern“ (erster Teil ist der Ort, der zweite nur Kantonshinweis), „Glattpark (Zürich)“, „Region Basel“, „Zürich Oerlikon“ (führende Wörter), „St. Gallen“ = „Sankt Gallen“, Genf/Genève, Biel/Bienne, Gemeindenamen wie „Illnau-Effretikon“. Unbekannte Postfach-PLZ (8000, 3000) → nächste bekannte PLZ. Tippfehler (1 Zeichen) nur bei Benutzereingaben (`fuzzy`), nie bei Anzeigen.

**Mehrdeutige Namen** (Buchs AG/SG/ZH/LU, Wil, Pfäffikon ZH/SZ … 104 Namen): 1. PLZ gewinnt, 2. Kanton im Text („Buchs AG“, „Buchs (ZH)“, „Wil, SG“), 3. Kantonshinweis der Quelle (jobs.ch-Strukturdaten hart, Yousty-Kantonsseite weich), 4. Liste `PREFERRED` in `places.ts` für die bekannten Fälle (Buchs → SG, Wil → SG, Pfäffikon → ZH …), 5. Gemeinde mit mehr Einträgen, 6. tiefere PLZ. Das Verzeichnis enthält keine Einwohnerzahlen, deshalb die Liste.

**Umkreis:** `RADIUS_OPTIONS = [0, 5, 10, 20, 30, 50]`, `0` = „Nur dieser Ort“ = gleiche Gemeinde (Uster inkl. Nänikon, Winterthur mit allen PLZ) oder gleicher Name im gleichen Kanton. Standard mit Ort: 10 km (`DEFAULT_RADIUS_KM`). Ohne Ort ist der Umkreis deaktiviert und es wird nichts nach Distanz gefiltert. URL: `l` = Ort, `r` = Umkreis (`r=0` = Nur dieser Ort). Alte Links: kein `r` mit Ort → 10 km; `r=100` (entfernte Option) → 50 km; anderes Ungültiges → 10 km. Distanz = Luftlinie zwischen den Ortschafts-Referenzpunkten.

**Was die Quellen können – und was wir deshalb tun** (live geprüft am 2026-11-11):
- **Yousty:** Die Ortsseite (`/lehrstellen/ZH/Winterthur/<beruf>`) zeigt 10 Anzeigen aus Youstys eigenem 14-km-Kreis, unsortiert; Seite 2 braucht `coordinates`/`distance`, was robots.txt verbietet (ohne diese Parameter kommt eine leere Seite). Wir lesen die **Kantonsseiten** (`/lehrstellen/<KT>/<beruf>`, normales `?page=N`) aller Kantone, die in den Umkreis reichen, und filtern selbst. Kein HEAD-Lookup mehr.
- **jobs.ch / jobup.ch:** kein Umkreis; `location` trifft nur den exakten Ort. **Lehrstellen:** landesweite Liste zum Beruf lesen (klein) und selbst filtern – findet auch Anzeigen ohne Ortsfeld. **Jobs/Praktika:** Namen der Ortschaften im Umkreis als mehrere `location`-Parameter (40 pro Abruf, nächste zuerst, max. 20 Abrufe); Namen mit Leerzeichen einzeln (max. 10), weil sie kombiniert die ganze Liste verdrängen. Bei 30/50 km sind das nicht mehr alle Ortschaften → dort kann jobs.ch für Jobs unvollständig sein.
- Jede Anzeige läuft durch `placeEntry()` (einzige Stelle, an der Distanzen entstehen): Ort normalisieren (`locateListing`), geokodieren, `distanceKm` (1 Dezimale) und `inPlace` setzen, ausserhalb des Umkreises verwerfen. Anzeigen ohne erkennbaren Ort werden bei gesetztem Ort ausgeblendet und gezählt (`hiddenWithoutPlace`, Hinweis in der Trefferzeile); ohne Ort bleiben sie drin.
- **Ort im Firmennamen:** leeres Ortsfeld + „Loomis Schweiz AG Kloten“, „Muster GmbH, Uster“, „Beispiel AG (Zug)“ → Firma/Ort werden getrennt, wenn der Schluss exakt eine Ortschaft ist (`splitCompanyPlace`). Yousty: „Bei **Firma** in **Ort**“ wird über das Wort davor zugeordnet, nicht über die Position.

**Antwort von `POST /api/job-search`** (neu): `query` (Beruf ohne Ort), `location`, `place: { label, name, plz, canton, lat, lon, radiusKm, fromQuery } | null`, `cantons?` (Kanton im Suchtext, z. B. „Informatiker Aargau“), `hiddenWithoutPlace`, pro Treffer `distanceKm?`/`inPlace?`, pro Quelle `status: ok | partial | unavailable | exhausted`. Cursor pro Quelle: `{ page, offset, segment? }` (`segment` = Index im Abrufplan). Unbekannter Ort → HTTP 422 `{ error, code: "unknown_place" }`.

**Browser:** lädt das Verzeichnis nie. Der Umkreis-Filter (`filter.ts`) und die Sortierung „Nächste zuerst“ nutzen `distanceKm`/`inPlace` der Treffer; Verkleinern des Umkreises braucht keine neue Suche, Vergrössern oder ein anderer Ort schon.

**Fehlerbehandlung:** pro Abruf 10 s Timeout, bis zu 2 Wiederholungen (300 ms, 900 ms) bei Netzfehlern und 429/5xx; neue Runden nur bis 25 s, insgesamt 45 s. Eine Seite ohne Anzeigen ist das Ende der Liste, kein Fehler. Fällt eine weitere Seite aus, bleiben die geladenen Treffer, die Quelle ist `partial`, der Cursor bleibt stehen und „Mehr laden“ versucht dieselbe Seite nochmals.

Tests: `tests/geo-places.test.mjs`, `tests/ort-suche-search.test.mjs`, `tests/ort-suche-filter.test.mjs` (offline, Fixtures in `tests/fixtures/ort-suche/`), E2E-Flow `ortsuche` in `scripts/jobsearch-e2e.mjs`.
