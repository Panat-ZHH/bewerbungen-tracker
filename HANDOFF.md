# HANDOFF – Ort-Suche (Agent B → Agent A)

Three new small UI parts for the search page. They carry **no colours, spacing or shadows of their own**; they only reuse the existing primitives (`Input`, `Select`, `Badge` from `components/ui`) so the page keeps its look until you style them. Everything below is yours to style. Please do not rename the class names, `data-*` attributes, ids or ARIA attributes: the e2e flow `ortsuche` (`scripts/jobsearch-e2e.mjs`) and screen readers rely on them.

What needs your attention first: **the suggestion list of `LocationAutocomplete` is unstyled** (plain `<ul>` in the flow, no highlight for the active option).

## 1. `LocationAutocomplete` – `components/job-search/location-autocomplete.tsx`

Ort field with suggestions "Ortschaft · PLZ · Kanton". Used in `filter-panel.tsx` (desktop sidebar and mobile filter sheet).

Props: `id` (required, also prefixes the list/option ids), `value` (committed place text), `onChange(value)` (called only on commit: suggestion chosen, Enter, leaving the field, or field emptied – not on every keystroke), `label = "Ort"` (aria-label), `placeholder = "Ort oder PLZ"`, `maxLength = 80`, `loadPlaces?` (test hook; default asks `GET /api/places?q=`).

Markup and classes:

```html
<div class="location-autocomplete" data-open data-loading>            <!-- data-open while the list shows, data-loading while fetching -->
  <input class="location-autocomplete__input" role="combobox" aria-expanded aria-controls aria-activedescendant … />   <!-- the existing <Input> -->
  <ul class="location-autocomplete__list" role="listbox" hidden>       <!-- `hidden` attribute when closed -->
    <li class="location-autocomplete__option" role="option" aria-selected="true|false" data-active>   <!-- data-active on the keyboard/hover option -->
      <span class="location-autocomplete__name">Winterthur</span>
      <span class="location-autocomplete__meta">8400 · ZH</span>
    </li>
  </ul>
  <div class="location-autocomplete__status sr-only" role="status" aria-live="polite">3 Vorschläge. …</div>
</div>
```

States to style:
- **closed / open**: `.location-autocomplete[data-open]`; the list has the `hidden` attribute when closed (do not override `display` for `[hidden]`).
- **active option**: `.location-autocomplete__option[data-active]` (same element has `aria-selected="true"`). Needs a clearly visible highlight; hover sets it too.
- **loading**: `.location-autocomplete[data-loading]` (150 ms debounce + request; a small spinner in the field is enough).
- **no suggestions**: the list stays hidden; only the screen-reader status says so.
- The list should float over the content below (make `.location-autocomplete` `position: relative`, the list `absolute`, full width, above the sidebar's sticky card; inside the mobile sheet it must not be clipped by `overflow`). Max. 8 options; give each at least 44 px height on touch devices.
- Keyboard: ↓/↑ move, Enter takes the active option (or the typed text), Escape closes the list (it does not close the mobile sheet while the list is open).

## 2. `RadiusSelect` – `components/job-search/radius-select.tsx`

Props: `id`, `value?: number` (km; `undefined` shows the default 10), `onChange(km)`, `disabled?`.
Renders the existing `<Select class="radius-select">`. The label "Umkreis" stays in `filter-panel.tsx` (your classes there are untouched).
- **enabled** (a place is set): options `Nur dieser Ort` (value `0`), `5 km`, `10 km`, `20 km`, `30 km`, `50 km`.
- **disabled** (no place): native `disabled`, one option "Zuerst einen Ort wählen". `Select` already has `disabled:opacity-60`; style further via `.radius-select:disabled` if you like.

## 3. `DistanceBadge` – `components/job-search/distance-badge.tsx`

Props: `km?: number`, `from?: string` (place label, used for the tooltip "Luftlinie ab Winterthur").
Renders `<Badge class="distance-badge" title="…"><span class="sr-only">Entfernung: </span>12 km</Badge>`; text is `"< 1 km"` below one kilometre; renders nothing without a distance (search without a place). It sits in `result-card.tsx` right after the location badge. An icon in front (e.g. lucide `Navigation`) would be a nice touch – add it inside this component.

## Shared files – what I changed (logic/text only, no className touched)

- `filter-panel.tsx`: the Ort `<Input>` became `<LocationAutocomplete>`, the Umkreis `<Select>` became `<RadiusSelect>` (the "Ganze Schweiz / kein Umkreis" option is gone); two imports added.
- `result-card.tsx`: new optional prop `placeLabel`, one line `<DistanceBadge … />`, one import.
- `filter-chips.tsx`: the place chip reads `Ort: Winterthur · +10 km` or `Ort: Uster · Nur dieser Ort`; the stand-alone radius chip is gone (a radius only exists with a place).
- `job-search-view.tsx`: state/handlers only, plus three text edits inside existing elements:
  - hit line: `… für „Informatiker“ in Winterthur (bis 10 km)` / `(nur dieser Ort)` / ` · ganze Schweiz`, optionally ` · 3 Anzeigen ohne erkennbaren Ort ausgeblendet`
  - source badges: `Yousty · 12`, `Yousty · 12 · noch nicht alle geladen` (status `partial`), `Yousty · antwortet gerade nicht` (status `unavailable`)
  - `<ResultCard … placeLabel={place?.label} />`
- Sort select: new entry `Nächste zuerst` (value `distance`). It is chosen automatically when a search has a place and switched back to `Relevanz` when the place is removed. The entry is also listed without a place (then it changes nothing); hiding it there means touching the long toolbar line, so I left that to you.

## Texts you may want to restyle or reword (all German, Swiss spelling)

- Unknown place (red `StatusMessage`): „Den Ort „Wintertuur“ kennen wir leider nicht. Wähle einen Vorschlag aus der Liste oder gib eine Postleitzahl ein.“
- A further page failed (info `StatusMessage`): „Yousty: Weitere Anzeigen konnten gerade nicht geladen werden. Deine bisherigen Treffer bleiben da – mit «Mehr laden» versuchst du es nochmals.“
- "Mehr laden" failed completely (red `StatusMessage`): „Weitere Stellen konnten gerade nicht geladen werden. Deine bisherigen Treffer bleiben da – tippe auf «Mehr laden», um es nochmals zu versuchen.“ – this is a temporary hiccup, not a user error; an info/warning tone would fit better than red (that is one `tone=` on the existing `{error && <StatusMessage tone="danger" …>}` line, which serves other errors too, so I did not change it).

## For your screenshots

`scripts/lib/jobsearch-stub.mjs` now answers like the real API: with a place (`?l=Winterthur`) the listings carry `distanceKm`, the answer has `place` and `hiddenWithoutPlace: 3`; location `nirgendwo` returns the unknown-place error. `/api/places` is a real route of the dev server (no login needed), so the suggestions work in your visual QA without a stub.

## Not mine, but needed

- Source attribution for the localities data (required by swisstopo's open-data terms): a line such as „Ortsdaten: Bundesamt für Landestopografie swisstopo“ in the Impressum or Datenschutz page (`components/legal/**`, yours).
