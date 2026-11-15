# QA – Shop v2 (sports cars, e-scooters, palace)

Branch `feature/shop-cars-palace` @ 4dc4fb3 (merge of `shop-items` 808bd19 + `palace` 4fd163f). Tested 2026-11-15.
All browser tests ran against a **mocked Supabase** (production build, `next start`, `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`). Nothing real was written. No migration was applied, nothing deployed, `main` untouched.

## Verdict

**Good to merge after one MAJOR fix** (the palace card blocking the open shop). No blockers. Lint, unit tests and build are clean, both new e2e suites pass, and the existing map e2e suites pass once their pre-existing stale selectors are patched. The palace is the strongest part. The cars work but two models look too much alike.

| Area | Score |
|---|---|
| Functionality (buy / place / rotate / move, "Bald" fallback, palace on/off) | 9/10 |
| Shop UI (chips, rarity badges, layout 375/768/1280) | 7/10 |
| Car art | 7/10 |
| E-scooter art | 8/10 |
| Palace art + celebration | 9/10 |
| Accessibility (touch targets, reduced motion, aria-live, dark mode) | 7/10 |
| Regression safety | 8/10 |
| **Overall** | **8/10** |

## Issues

### BLOCKER
None.

### MAJOR
**M1 – Palace celebration card covers the open shop and swallows clicks.**
The card (`[data-testid=palace-celebration]` inside the `aria-live` region) is not a modal: there is no backdrop and the map stays usable. It still sits above the shop panel and intercepts pointer events there.
- Repro: viewport 900×640 (it also happens at other desktop/tablet sizes where the card and shop panel overlap), one application with status `offer` and no `wendapply:palace-seen:<id>` key. Open /map, open **Laden** while the card is showing, then click "Zierbaum kaufen". Nothing happens, and Playwright reports `<div data-testid="palace-celebration"> … intercepts pointer events`.
- Impact: every existing user who already has a Zusage gets this card once after deploy. If they open the shop before dismissing it, the items under the card are dead.
- Side effect: `scripts/map-interaction-e2e.mjs` (its fixture contains an `offer` application) now fails in the placement step. On `origin/main` the same step passes. With the seen flag pre-set the suite passes 48/48, so this card is the only cause.
- Suggested fix (app code, not done here): close or hide the celebration when the shop sheet or any panel opens, **or** put the shop above it, **or** make it a real dialog with a backdrop. Also add `localStorage['wendapply:palace-seen:a4']='1'` (or a click on "Super, weiter") to the map-interaction fixture.

### MINOR
1. **Porsche and Audi R8 look almost identical.** Both are light (silver vs white) wedge coupés with the same silhouette, in the 80 px shop preview and on the map (`shop-*-2-autos.png`, `placed-1280-showroom.png`). The REPORT promises a "round silver Porsche with round headlights", but you can't see that at map scale. Suggest a clearly rounder roof/rear or a different colour (e.g. yellow or dark blue).
2. **McLaren's "doors swung up" read as a loose orange slab or spoiler** floating above the car (`placed-1280-showroom.png`, top right). It's a fun idea, but it needs to attach visibly to the cabin.
3. **Category chips are 40 px tall**, below the 44 px touch-target guideline. All other shop buttons measure ≥44 px (`qa-measurements.json`).
4. **The chip row doesn't fit the panel at any width** (321 px on phones, 370 px on tablet and desktop). "Alle" or "E-Roller" is always half cut off and there's no fade or arrow to show the row scrolls (`shop-768-2-autos.png`, `items/desktop-1280-1-shop-autos.png`).
5. **Phones: after buying and placing, the shop sheet stays open** over most of the map, with the item toolbar under it, so you can't see where the car went (`items/mobile-375-2-ferrari-placed.png`). Only about 1.5 shop items are visible at once on 375×812 because header, points pill and chips take the top half of the sheet. The sheet also covers the lower end of the right-hand zoom column. That overlap is a pre-existing MapSheet behaviour.
6. **Dark mode:** the shop and palace card switch correctly, but the 3D preview tiles stay light. That's acceptable but looks bright on the dark card (`shop-375-dark-3-autos-legendaer.png`). The map scene itself doesn't darken (pre-existing: it has its own night toggle).
7. **Prices outside the plan's ranges:** Bugatti costs 2800 (plan said 300–2500) and the Retro-E-Mopeds cost 220/240 (plan said 60–200). Fine if intended; just update PLAN.md.
8. **Brand names in item names** ("Ferrari-Sportwagen", "Bugatti-Hypersportwagen", …). The plan allows text labels and there are **no logos**: I checked the models (no textures, text or canvas in `lib/map-shop-models.ts`) and every screenshot. Using trademarks as names is a product/legal decision worth a conscious yes.
9. **Stale legacy e2e scripts (pre-existing, also fail on `origin/main`, not regressions):** `map-integration-e2e`, `islands-e2e`, `map-interaction-e2e` look for a `Shop` button (now "Laden" / shopping-bag icon). `map-integration-e2e` and `islands-e2e` also expect an inventory/island UI that has changed since. `friend-island-e2e`'s "only read RPCs" whitelist misses newer read-only RPCs (`my_notifications`, `class_my_classes`, `social_get_share_*`, `social_avatars`). Worth a separate clean-up commit.

## What passed

- `npm install` OK. `npm run lint`: **0 errors** (8 pre-existing warnings in old scripts/tests).
- `npm test`: **349/349 pass**.
- `npm run build` with dummy env (`https://example.supabase.co` / `dummy`): **OK**.
- `scripts/shop-v2-items-e2e.mjs` (1280 + 375): **26/26**. Covers chips (Alle 21 / Deko 3 / Park 3 / Autos 8 / E-Roller 7), 8 car previews sorted by price, rarity badges, Ferrari bought at server price, placed rotated, scooter placed, car moved + rotated, showroom without console errors, "Bald" for all 8 cars before the migration, and the friendly "Dieses Modell ist bald erhältlich." with no points lost when the catalogue can't be read.
- `scripts/palace-e2e.mjs` (1280, 375, 375 reduced motion): **all checks pass**. Covers overlay text in aria-live polite, dismiss, seen flag, no repeat after reload, status change turns it back into a house, no confetti with reduced motion, and no page errors.
- Regression suites against this branch, with only the stale selectors patched in temp copies (not committed):
  - `map-interaction-e2e`: **48/48** with the palace marked as seen (20/21 without it, see M1). Covers wheel/pinch/pan/inertia/clamp, placement without scene rebuilds, drag arbitration and the hidden-tab render pause.
  - `map-integration-e2e`: map renders, click-to-place, tree placed, house moved and item stored all pass. It then stops at the same stale inventory/island selectors as on main.
  - `friend-island-e2e`: 29 checks pass, the friend view is read-only and **no `map_shop*` RPC is called**. Only the stale whitelist check fails, as on main.
  - `islands-e2e`: stale on main and on this branch (island panel selector); nothing shop-related.
- Own script `scripts/shop-v2-qa-shots.mjs` (light + dark, 375/768/1280): **0 console errors** in all 14 sessions. No horizontal page overflow and no text overflow in shop item names, prices or badges at any width ("Mercedes-AMG-Sportwagen" and "Bugatti-Hypersportwagen" wrap cleanly to 2 lines on 375). "Super, weiter" button is 148×47 px.
- **Reduced motion:** all map animations (flags, fountain, villagers, palace rise + sparkles) are gated by `motion` in the render loop, the camera glide is instant, and CSS confetti/card/crown animations only run under `prefers-reduced-motion: no-preference`.
- **Art:** the 8 cars have clearly different colours, and Lamborghini (lime + orange wing), AMG (black, grille bars), Bugatti (two-tone blue) and Aston Martin (long green hood) also read well by shape. The scooters are clearly three families (kick, sport with fenders, retro moped) and look cute on their pads. The palace (cream hall, coral onion domes, gold dome + crown, hedges, fountain) fits the 5×5 plot and village style, and the back-to-house switch works (`palace-1280-dark-3-back-to-house.png`).
- **Preview** https://shop-cars-palace--bewerbungen-pawat.netlify.app (not logged in, nothing written): `/`, `/login`, `/hilfe`, `/impressum`, `/datenschutz`, `/schulen` load with 200 and no console errors. `/map` redirects to `/login` with one expected 401 from the session check.

## Screenshots (`docs/shop-v2/shots/qa/`)
- `shop-{375,768,1280}[-dark]-{1-alle,2-autos,3-autos-legendaer,4-e-roller}.png`: shop, chips, car + scooter previews, rarity badges.
- `placed-{375,768,1280}[-dark]-showroom.png`: all 8 cars + 7 scooters placed on the map.
- `palace-768-*`, `palace-1280-dark-*`, `palace-375-dark-*`: celebration → palace → back to house.
- `items/`: rerun of `shop-v2-items-e2e` (buy, place, before migration, fallback) at 1280 + 375.
- `palace/`: rerun of `palace-e2e` at 1280, 375 and 375 with reduced motion.
- `qa-measurements.json`: touch-target sizes, overflow checks and console errors per session.

Rerun: build or `next dev` with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy`, then `PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=<url> node scripts/shop-v2-qa-shots.mjs` (`ONLY=shop|placed|palace` for one part).

## Fixes (2026-11-15)

- **M1 fixed: the palace card no longer covers panels.** `PalaceCelebration` has a `paused` prop. `/map` sets it while the shop sheet, an application sheet or a placement is active, so the card unmounts. It is **not** marked as seen and comes back when the panel closes. Top-bar chip panels (Insel, Suche) and every `MapSheet` now carry `data-map-panel`, and `.palaceLive` is hidden via `[data-map-fullscreen]:has([data-map-panel])`. Esc that closes a chip panel no longer also dismisses the card.
  - Regression check in `scripts/palace-e2e.mjs` (1280, new 900×640, 375): it opens **Laden** while the card is pending. It then checks that the card steps aside, that the first "kaufen" button passes Playwright's actionability check (`click({ trial: true })`, i.e. nothing intercepts the pointer), that the seen flag is still unset, and that the card returns after the shop closes. Shot: `palace/<vp>-2b-shop-open-card-hidden.png`.
- **MINOR 1:** the Porsche is now **yellow** with a round bubble roof that runs down into a rounded tail, plus a dark ducktail. The Audi R8 stays white with the notched cabin and side blade.
- **MINOR 2:** McLaren dihedral doors are hinged at the base of the windscreen pillar, flush with the cabin side, and swing up with a glass upper half (`placed-1280-showroom.png`).
- **MINOR 3:** category chips are now `min-height: 44px`.
- **MINOR 4:** chips are tighter (gap 6, padding 10), and the row's right edge fades out (mask) with end padding, so it's visible that the row scrolls and the last chip can scroll fully clear.
- **MINOR 7:** PLAN.md now lists the actual prices (cars 400–2800, scooters 60–240). Prices and sizes in `lib/map-shop.ts` and the migration are unchanged.
- **Legacy e2e:** `map-interaction-e2e`, `map-integration-e2e` and `islands-e2e` pre-set `wendapply:palace-seen:<id>` for their `offer` application. The stale `Shop` selectors are now `/^(Laden|Shop)$/`.
- Not changed (out of scope): MINOR 5, 6 and 8. The remaining stale island-panel selectors in `map-integration-e2e` and `islands-e2e` are pre-existing, also fail on main, and are not trivial to fix.

**Results after the fixes:** lint 0 errors. `npm test` 349/349. Build OK with dummy env. `shop-v2-items-e2e` 26/26. `palace-e2e` all checks pass (1280, 900, 375, 375 reduced). `map-interaction-e2e` **48/48 without patches**. `map-integration-e2e` 8/10: the shop and placement steps pass, and only the stale island-panel step fails, as on main. QA screenshots in `shots/qa/` were refreshed with 0 console errors.
