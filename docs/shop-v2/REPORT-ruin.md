# Report – Burnt house for rejections (branch `burning-house`, based on `palace`)

## What it does
- Every application with status `rejected` (label «Absage erhalten") is drawn as a **burnt-down ruin**: scorched lawn and ash footprint, jagged charred walls with burnt-out window holes (faint ember glow), corner posts and a broken chimney, **collapsed roof** (two fallen slabs, loose rafters, ridge beam), rubble, glowing embers, three small low-poly **fires** (flickering, swaying) and two **smoke columns** (puffs rise, drift and thin out at the top).
- Original low-poly, flat-shaded art in the village style (three.js, same helpers/plot as houses and palace). Tasteful: no red alarm colours on the UI, label stays the calm «Absage erhalten», no people around the ruin.
- **Data-driven**: purely derived from the status, no DB change. Change the status away from `rejected` and it is a normal house again on the next render.
- **prefers-reduced-motion**: the map loop skips all animations, so the ruin is a static pose (flames at rest size, smoke spread along the column).
- `withdrawn` (Zurückgezogen) is not a rejection and keeps the calm closed-house look.
- Friend view reuses `building()`: friends only see the ruin if the user shares outcomes (otherwise the server already masks it as «beworben»).

## Precedence decision
Houses are per application, so one house is never palace and ruin at once. There is no per-user house today; for any future user/island-level look, `summaryLook()` lets a **palace win over ruins** (a Zusage is what counts; rejections are part of the way there). Order in `building()`: palace → ruin → normal house.

## Files
- `lib/map-ruin.ts` (pure): `isRejectedStatus`, `houseLook`, `isRuin`, `ruinApplications`, `summaryLook`, `flameFlicker`, `smokePhase`, `smokeScale`.
- `lib/map-ruin-model.ts`: `buildRuin(helpers, group, { selected, seed })`.
- `components/applications/application-map-world.tsx`: ruin branch after the palace branch (9 lines).
- `tests/map-ruin.test.mjs` (8 tests), `scripts/ruin-e2e.mjs` (mocked Supabase), screenshots `docs/shop-v2/shots/ruin/`.

## Results
`npm test` 347/347, lint 0 errors (warnings only pre-existing), `tsc` clean, build OK, `ruin-e2e` at 1280 / 375 / 375 reduced motion: all checks pass.
