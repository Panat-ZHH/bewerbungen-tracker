# QA-Review: Eltern-Dorf «stillgelegt» (fix/parent-village-live, d8d2b03)

Unabhängiges Code-Review von `git diff origin/main...HEAD` (2026-11-22). Es wurde kein Code geändert, nichts gepusht und nichts deployed.
Lokal ausgeführt: `node --test tests/read-only-village.test.mjs tests/family-village.test.mjs tests/family-child-village-db.test.mjs`
ergab 22/22 grün. Die E2E-Skripte habe ich nicht erneut ausgeführt.

## Zusammenfassung

- **Korrektheit:** Die Ursache ist plausibel und sauber behoben. Ohne geteilte Bewerbungsliste setzte `parseFamilyVillage` ein
  leeres `company`, und `dorf.module.css` versteckte dann per `:has(> strong:empty)` **alle** Hausschilder. Jetzt rendern
  Eltern- und Freunde-Seite denselben `ReadOnlyVillageView` mit denselben `readOnlyWorldProps()`. Dazu gehören Tag/Nacht, die
  Kamera, der Insel-Umschalter und das Badge. Die Labels sind gleich («Haus N» bzw. die Firma). Der Paritätstest vergleicht
  Props und Positionen von Häusern und Strassen in beiden Fällen.
- **Read-only:** gewährleistet. `ApplicationMapWorld` überschreibt bei `readOnly` zusätzlich alle Handler, `drag`, `placement`
  und die Auswahl (`components/applications/application-map-world.tsx:65`). Labels sind im Read-only-Modus `<span>` statt
  `<button>` (Zeile 125–128). Kein Shop-Hook, kein `map_shop`, keine Münzen. Die Eltern-Seite ruft weiterhin nur
  `family_child_village` auf, und die Freunde-Seite nur `map_friend_island`.
- **Datenschutz-Gate (serverseitig):** unverändert und korrekt. Das RPC ist `security definer` mit `search_path = ''`. Es
  prüft: aktiver Elternteil, aktives Kind derselben Familie, `_family_sharing_allowed`, `village = true`, Firmen nur bei
  `applications = true`. Ausführen darf es nur `authenticated` (nicht anon und nicht service_role), und es ist durch die
  Paywall gekapselt. Es gibt keine Migration und keine neue RPC. Der neue DB-Test deckt einen entfernten Elternteil und
  `village = false` ab.
- **Regressionen:** Das Kinder-eigene Dorf (`/map`) ist nicht betroffen, weil es nicht im Diff ist. Die Freunde-Ansicht ist
  funktional gleich. Es gibt nur eine kleine Textänderung (siehe unten).

## Befunde

### 1. minor – Statuszeile pro Haus ist jetzt auch ohne geteilte Bewerbungsliste lesbar (Produktentscheid bestätigen)
- **Wo:** `lib/family-village.ts:41` zusammen mit dem entfernten CSS in `app/familie/kind/[id]/dorf/dorf.module.css` (alt Z. 4).
  Gerendert wird das in `components/applications/application-map-world.tsx:127` (`statusLabels[application.status]`).
- **Was:** Vorher war bei `applications = false` das ganze Schild weg, also auch der Status-Text. Jetzt sehen Eltern bei jedem
  Haus z. B. «Haus 4 · Absage erhalten». `family_child_village` liefert die **echten** Status, auch Absage, Zusage und Rückzug.
  Die Freunde-RPC maskiert diese Ergebnisse dagegen standardmässig (`_soc_friend_status`, `share_outcomes_with_friends = false`).
  Laut Freigabetext (`lib/family-core.ts:245`) gehört «Status jeder Bewerbung» zu «Bewerbungsliste teilen». Der Text zu «Dorf
  teilen» (`:246`) verspricht aber nur, dass Firmennamen privat bleiben. Ein Teil dieser Information war schon vorher sichtbar,
  nämlich über die Gebäudeform (Ruine, Palast). Die Statusanzahlen sehen Eltern ausserdem über «Fortschritt teilen» (Standard an).
  Deshalb ist das kein Leak von Feldern, die bisher geheim waren, aber die Information ist jetzt deutlich expliziter.
- **Vorschlag:** Mit Panat bestätigen. Wenn der Status ohne geteilte Bewerbungsliste nicht lesbar sein soll, gibt es zwei Wege:
  (a) Clientseitig bei `!showCompanies` nur «Haus N» ohne Statuszeile anzeigen, etwa mit einer eigenen Prop `hideStatus` in
  `ReadOnlyVillageView`/`readOnlyWorldProps`. Die Schilder bleiben dann sichtbar, und das Dorf wirkt trotzdem nicht leer.
  (b) In der RPC die Ergebnisse analog zu `_soc_friend_status` maskieren. Andernfalls sollte der Text in `family-core.ts:246`
  ergänzen: «Den Stand jedes Hauses (z. B. Absage) sehen sie.»

### 2. minor – Paritätstest verdeckt den Unterschied bei der Ergebnis-Maskierung
- **Wo:** `tests/read-only-village.test.mjs:22` (`outcomesShared: true`).
- **Was:** Der Test simuliert die Freunde-Seite mit freigegebenen Ergebnissen. Die echte Standardeinstellung für Freunde ist
  aber maskiert. «Identisch zur Freunde-Ansicht» gilt also nur für diesen Fall. Für Eltern ist das gewollt, aber nirgends als
  Absicht festgehalten.
- **Vorschlag:** Im Testkommentar oder in `docs/family/parent-village-contract.md` festhalten: «Eltern sehen echte Status, Freunde
  nur bei `share_outcomes_with_friends`.» Optional einen Test ergänzen, der genau diesen gewollten Unterschied prüft.

### 3. minor – Echte Bewerbungs-IDs gehen an Eltern (vorbestehend, nicht durch diesen Diff)
- **Wo:** `supabase/migrations/20261121100000_family_child_village.sql:40` (`'id', a.id`). Die Freunde-RPC nutzt dagegen
  `pseudo_id`.
- **Was:** Sie lassen sich nicht ausnutzen, denn RLS auf `applications` schützt weiter, und Eltern können damit nichts abfragen.
  Es ist aber eine kleine Abweichung vom Datensparsamkeits-Muster der Freunde-RPC.
- **Vorschlag:** Später optional pseudonyme IDs liefern, auch für `layouts.id`. Das blockiert diesen Fix nicht.

### 4. minor – Ladetext der Freunde-Ansicht geändert
- **Wo:** `components/applications/read-only-village-view.tsx:48` (Suspense-Fallback fest «Dorf wird aufgebaut ...»).
- **Was:** Die Freunde-Ansicht zeigte vorher «Insel wird aufgebaut ...». Das ist eine kleine Textregression.
- **Vorschlag:** Den Fallback-Text als Prop übergeben oder `waitingText` wiederverwenden.

### 5. minor – Neuer DB-Test räumt seinen Zustand nicht explizit auf
- **Wo:** `tests/family-child-village-db.test.mjs:156–165`.
- **Was:** Der Test setzt den Elternteil auf `removed`, dann zurück auf `active`, und danach `village = false`. Anders als
  andere Tests (`:150`, `:153`) ruft er am Ende nicht `reset()` auf. Die Tests sind heute grün, weil `family()` jedes Mal neue
  Nutzer anlegt. Bei späteren Tests, die globale Zustände zählen, könnte das aber fragil werden.
- **Vorschlag:** Wie in den Nachbartests am Ende `await reset();` aufrufen. Den Fall «Elternteil `pending`» deckt schon
  `:135` ab.

### 6. Hinweis (keine Schwere) – Restrisiko beim Symptom
- Laut Analyse lief die Animation schon vorher. Sichtbar fehlten nur die Schilder. Das ist mit fps- und Frame-Diff-Messungen
  belegt und überzeugend. Wenn Panat nach dem Deploy trotzdem ein «eingefrorenes» Dorf sieht, als Nächstes «Bewegung
  reduzieren» auf dem Gerät des Elternteils prüfen. Diese Einstellung gilt für beide Ansichten gleich.

## Geprüft ohne Befund
- Keine Mutations-Endpunkte aus der Eltern-Ansicht erreichbar. Kein `useMapShop`, `ShopPanel`, `saveLayout` oder `placeItem`,
  keine Münzen. Das prüfen die Tests per String-Match, und es ist im Code bestätigt.
- `parseFamilyVillage` kopiert nur `id`, `status` und optional `company` (bereinigt durch `cleanCompany`, max. 80 Zeichen).
  Unbekannte Felder werden verworfen.
- Die Insel-Anzahl ist auf 1–99 begrenzt. Die Reihenfolge der Häuser (`createdAt`-Padding) ergibt dieselben Positionen wie
  bei Freunden. Das ist getestet.
- `friend-island.ts` re-exportiert `houseLabel`, bestehende Importe funktionieren also weiter.

VERDICT: OK
