# Report – Part A `shop-items` (Shop v2: Sportwagen + E-Roller)

## What was built
- **15 new shop items** in `lib/map-shop.ts` (`shopCatalog`), each with `category` + `rarity` (existing 6 items unchanged in price/size; now tagged Deko/Park):
  - **Autos (2x1, rotatable)**: `car_porsche` 400 (selten), `car_audi_r8` 450 (selten), `car_amg` 550 (selten), `car_mclaren` 900 (episch), `car_aston_martin` 1100 (episch), `car_ferrari` 1600 (episch), `car_lamborghini` 1900 (legendär), `car_bugatti` 2800 (legendär). Brand names are German text labels only (e.g. «Ferrari-Sportwagen»).
  - **E-Roller (1x1)**: `scooter_city_mint`/`_lilac` 60, `scooter_sport_black`/`_lime` 120 (gewöhnlich), `scooter_retro_cream`/`_sky` 220, `scooter_retro_coral` 240 (selten).
- **3D models** in `lib/map-shop-models.ts`: original low-poly flat-shaded designs, no logos/badges. Shared car builder (extruded side profile + glass cabin + wheels + lights) with a distinct silhouette per brand: Ferrari red with side intakes, Lamborghini green wedge with orange wing, Porsche round silver with round headlights, McLaren papaya with doors swung up, Aston Martin racing green long hood, Bugatti two-tone blue with curved side line, AMG black/silver with grille bars and quad exhausts, Audi R8 white with dark side blade. Scooters: kick «Stadt-Roller», beefier «Sport-Roller» with fenders, «Retro-E-Moped» (leg shield, rounded rear, seat). Vehicles stand on a light parking pad. SVG previews framed tighter for vehicles; near-side wheels get `renderOrder` so the depth-less SVG preview draws them correctly.
- **Shop UI** `components/applications/map-shop.tsx`: category chips (Alle, Deko, Park, Autos, E-Roller, with counts, horizontally scrollable on phones), rarity badge next to the price, items sorted by price, lucide icons (CarFront, Bike, Zap, Sparkles). CSS appended in a marked block at the end of `app/map/map.module.css`.
- **Migration** `supabase/migrations/20261115000000_shop_cars_scooters.sql`: only `insert … on conflict (item_type) do nothing`. **Not applied anywhere** – must be applied to production (bhwreehwirrloxagyypi) by a human/after approval.
- **Graceful fallback until the migration is live**: the shop reads `map_shop_catalog` (select is granted to authenticated); items missing there show a disabled «Bald» button. If the catalogue can't be read, buying is attempted and `map_shop_buy`'s `INVALID_ITEM` (or FK `23503`) shows the info hint «Dieses Modell ist bald erhältlich.» and marks the item «Bald». Points are never deducted client-side (state only comes from the server).

## Files
`lib/map-shop.ts`, `lib/map-shop-models.ts`, `components/applications/map-shop.tsx`, `app/map/map.module.css` (Part A block), `supabase/migrations/20261115000000_shop_cars_scooters.sql`, `tests/map-shop-v2.test.mjs`, `scripts/shop-v2-items-e2e.mjs`, screenshots in `docs/shop-v2/shots/shop-items/`.
Also touched (outside my list, minimal): `tests/map-shop.test.mjs` – the old assertion «catalogue has exactly 6 items» became «at least 6».

## Tests
- `npm test`: 341/341 pass (new `tests/map-shop-v2.test.mjs`: 10 tests – catalogue tiers/footprints/rarities, category sort, rotated car placement, error mapping, migration parsed and compared 1:1 with `shopCatalog`, no DROP/ALTER/UPDATE/DELETE, PGlite: buy fails with INVALID_ITEM and no deduction before the migration, works after it, migration idempotent, place rotated car, occupied-cell rejection).
- `npm run lint`: 0 errors (8 pre-existing warnings in other files).
- `npm run build` (dummy env): OK.
- E2E `scripts/shop-v2-items-e2e.mjs` against mocked Supabase, 1280px + 375px: 26/26 pass – chips, 8 car previews, buy Ferrari (server price), place rotated, buy + place scooter, move + rotate car, showroom of all vehicles renders without console errors, «Bald» before migration, friendly fallback with balance unchanged.

## Open
- Apply the migration to production only after approval (until then new items show «Bald»).
- Drag & drop itself wasn't driven by pointer in the E2E (move was tested via the «Verschieben» flow, which uses the same `map_shop_place` and footprint logic); the 3D models go through the generic `createShopModel` path that drag uses.
