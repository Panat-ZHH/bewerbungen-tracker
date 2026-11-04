# Islands

- All numbers live in `lib/islands-config.ts` (price, land rect, bridge rect, camera focus). The same values are seeded in `supabase/migrations/20261104000002_islands.sql` (`map_island_catalog`); a test compares both.
- Prices (spendable points, 100 per submitted application): island 1 free, island 2 = 600, island 3 = 1500, island 4 = 3000. Islands unlock in order.
- One continuous world grid: island 2 lies east of the first (bridge x 33-38), island 3 south of island 2, island 4 east of island 3. Existing placement logic is reused; `isPlaceableArea` (lib/islands.ts) and `map_area_ok` (SQL) require the whole footprint on ONE unlocked island and off every bridge incl. a 2-cell landing on each end. Streets stay locked.
- Unlock is server-side: `map_island_unlock(n)` locks the wallet row, checks order and price, deducts points, is idempotent. `map_islands` has RLS (select own rows only, no write grants).
- Without the migration the map falls back to the single free island (setup-error fallback like the shop); the panel says the DB update is pending.
- UI: `IslandPanel` (switcher, "x / N Punkte", unlock button, celebration), scenery in `lib/island-scenery.ts` (next island shown as a faint ghost, rise-from-the-sea animation + camera flight on unlock).
- Local check: `scripts/islands-e2e.mjs` (stubbed Supabase, see header). Apply the migration only after approval.
