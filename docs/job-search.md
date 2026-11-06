# Job- und Lehrstellensuche – Filter-Kern (`lib/job-filters`)

Reine TypeScript-Module (keine React-/Next-Importe), per `node --experimental-strip-types` testbar. Vertrag: `types.ts`.

| Modul | Zweck |
|---|---|
| `query.ts` | `normalize`/`fold` (Umlaute, ä=ae=a), `tokenize` (Stoppwörter, „/in“, „(m/w/d)“), `expandQuery` (Synonymgruppen Lehrstelle/Lehre/EFZ/EBA/Ausbildung/Stift, Praktikum/Stage, Teilzeit, Informatiker/Fachmann Information, Kauffrau/Kaufmann, Detailhandel, FaGe, … plus Städtenamen DE/FR/EN), Tippfehlertoleranz (Edit-Distanz 1 ab 4, 2 ab 8 Zeichen), `queryVariants` für Server-Suchen |
| `rank.ts` | `rankJobs(jobs, state, now)` → `RankedJob[]`: Titel 1.0 > Firma 0.6 > Ort 0.5 > Snippet 0.25; exakt > Präfix > Teilstring > Tippfehler; Synonym ×0.8; Phrasen-Bonus; Aktualität (≤0.15); stabil. Alle Begriffe sind UND-verknüpft, Treffer mit < 50 % der Begriffe fallen weg. `highlightSegments(text, ranges)` für die UI |
| `filter.ts` | `applyJobFilters(jobs, filters, {strict, now, savedUrls})`. Fehlende Daten bleiben drin, ausser `strict: true` oder `strict: { cantons: true }`. `passes()` einzeln für Facetten |
| `geo.ts` | Kantone (Zentroid), ~90 Städte, PLZ-Bereiche → Kanton, `resolveLocation`, `distanceKm` (Radius ist eine Näherung, Kantons-Zentroide ±20 km) |
| `taxonomy.ts` | Branchen (`FIELDS`), Labels (DE), `classifyJob` (Pensum „80-100 %“, EFZ/EBA/BM/HF/FH/Uni, Lehrbeginn 2027, Homeoffice/Remote, Sprache, Typ), `enrichJob` (Provider-Felder gewinnen, Rest wird abgeleitet; gecacht) |
| `dedupe.ts` | `dedupeJobs`: gleiche URL oder gleiche Firma+Titel(+Ort/Jahr) quellenübergreifend, behält alle Quellenlinks und Zusatzfelder |
| `url.ts` | `stateToParams`/`paramsToState`, kurze Schlüssel: `q k l r c t wn wx f y e g co s p rm sm on hs so`; Defaults weggelassen, ungültige Werte verworfen |
| `storage.ts` | Letzte Suchen (max. 8) und Presets in `localStorage` (`wendapply.jobsearch.recent/presets`), SSR-sicher, Storage injizierbar |
| `facets.ts` | `computeFacets`: Zähler pro Filterwert, disjunktiv (eigene Auswahl zählt nicht mit) |
| `sort.ts` | `sortJobs(ranked, sort)`: relevance/newest/company/location/start, Fehlendes zuletzt, stabil |
| `index.ts` | Barrel + `searchJobs(jobs, state, options)` = dedupe → filter → rank → sort (+ Facetten) |

Tests: `tests/job-filters-core.test.mjs`.
