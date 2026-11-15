# Shop v2 – Sportwagen, E-Roller und Palast (Branch `feature/shop-cars-palace`)

Base: `origin/main` @ a8ceb66 (production). Integration branch: `feature/shop-cars-palace`. Never push `main`, never `--prod`, never apply migrations to production.

## How the shop works today (findings)
- Village map = three.js scene (`components/applications/application-map-world.tsx`, 969 lines). Every application is a **house** (`building(application, x, z, selected)`, stage from `buildingStages` in `lib/application-map.ts`).
- Shop catalogue in code: `lib/map-shop.ts` → `shopCatalog` (road 20, flowers 30, tree 40, bench 50, fountain 150, amusement_park 500; width/depth in grid cells). 3D models in `lib/map-shop-models.ts` (`createShopModel(type)`, flat-shaded low-poly boxes/cylinders, pastel palette) and shop thumbnails rendered from those models as SVG (`renderShopPreviews`). Shop UI: `components/applications/map-shop.tsx` (icons map per type).
- DB (Supabase WendApply `bhwreehwirrloxagyypi`): `map_shop_catalog(item_type pk, price, width, depth)`, `map_wallets(balance, earned)`, `map_application_rewards` (100 points per application), `map_items(item_type FK → map_shop_catalog)`, `map_layouts`. RPCs `map_shop_state`, `map_shop_buy` (price from DB catalogue, raises `INSUFFICIENT_POINTS`), `map_shop_place` (size from DB catalogue). Islands cost 600/1500/3000.
- ⇒ New items can only be **bought/placed** once their rows exist in `map_shop_catalog` (FK + server price). Without the migration the preview can show them but buying fails.
- Acceptance: status `offer` (label «Zusage») and `contract_signed`. Existing joy/confetti: `lib/joy.ts`, island celebration in `components/applications/island-panel.tsx` + `app/map/map.module.css`.

## Part A – `shop-items` (branch `shop-items`, worktree `~/Projects/bewerbungen-tracker-wt/shop-items`)
Owns: `lib/map-shop.ts` (catalogue entries + optional category/rarity metadata), `lib/map-shop-models.ts` (car + scooter models), `components/applications/map-shop.tsx` (category tabs/filters, rarity badges, «erst nach Freischaltung kaufbar» handling), shop-related CSS appended in a clearly marked block of `app/map/map.module.css`, new migration `supabase/migrations/20261115000000_shop_cars_scooters.sql`, tests `tests/map-shop-v2.test.mjs`.
- 6–8 sports-car brands (text labels only, no logos), tiered prices 400–2800 (Porsche 400 … Bugatti 2800), rarity (gewöhnlich/selten/episch/legendär); several e-scooter models/colours 60–240 (Stadt 60, Sport 120, Retro-E-Moped 220/240). Prices as shipped in `lib/map-shop.ts` and the migration.
- Migration: `insert into public.map_shop_catalog … on conflict (item_type) do nothing` only. No DROP/ALTER/UPDATE.
- If the shop loads a catalogue item that is not yet in the DB, show it as «bald verfügbar» instead of failing.

## Part B – `palace` (branch `palace`, worktree `~/Projects/bewerbungen-tracker-wt/palace`)
Owns: new `lib/map-palace.ts` (pure logic: `isAccepted(status)`, `hasPalace(applications)`, celebration-seen state via localStorage), palace model inside `building()` in `components/applications/application-map-world.tsx` (ONLY the house-building code path; no shop-item code), new `components/applications/palace-celebration.tsx`, palace CSS block in `app/map/map.module.css` (separate marked block), tests `tests/map-palace.test.mjs`. Optional: same palace rendering in friend island view if it reuses `building()`.
- House of each application with status `offer`/`contract_signed` renders as a palace; reverts automatically when status changes. One-time celebration (localStorage key per user+application), respects `prefers-reduced-motion`, mobile-first. No DB change required.

## Part C – Tester (`--after` merge)
Build, lint, `npm test`, screenshots 375/768/1280, shop purchase flow (mocked), palace on/off, regressions → `docs/shop-v2/QA.md`.

## Conflict note
Only shared file: `app/map/map.module.css` (each part appends its own marked block at the end) → trivial merge.
