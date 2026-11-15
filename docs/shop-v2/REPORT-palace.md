# Report – Part B: Palace (branch `palace`)

## What was built
- **Palace instead of a house** for every application with status `offer` (Zusage) or `contract_signed`. Original low-poly, flat-shaded model in the village style: cream main hall with battlements and arched windows, porch with columns and gold pediment, four towers with coral onion domes and gold spires, two gently waving flags, a large golden dome with a small golden crown and coral gem on top, front garden with hedges, flower bed and a little fountain. Fits the same 5x5 plot (ground pad 4.3 x 4.2).
- **Purely derived from the status** (no DB change): the palace turns back into the normal house as soon as the status changes away from offer/contract_signed.
- **One-time celebration**: the first time a palace appears, the camera glides to it, the palace rises out of the ground with circling sparkles (1.5 s), and a card shows "Zusage! Dein Haus ist jetzt ein Palast." with confetti, company/position, the button "Super, weiter" (Esc works too) and an `aria-live="polite"` region. Counts as seen once dismissed (localStorage `wendapply:palace-seen:<applicationId>`), so a celebration that was never closed comes back on the next visit. Without storage/SSR nothing celebrates.
- **prefers-reduced-motion**: no rise, no sparkles, no confetti/card animation; static palace + message only (verified in the e2e run).
- **Friend view** (`components/friends/friend-island-view.tsx`) uses the same `building()`, so friends see palaces too, without any overlay (file unchanged).

## Files
- `lib/map-palace.ts` (new, pure): `isAcceptedStatus`, `isPalace`, `palaceApplications`, `hasPalace`, `palaceSeenKey`, `hasSeenPalace`, `markPalaceSeen`, `unseenPalaces`, `palaceRiseProgress`, `PALACE_RISE_MS`.
- `lib/map-palace-model.ts` (new): `buildPalace(helpers, group, { selected, riseStart })` → per-frame animations.
- `components/applications/application-map-world.tsx`: palace branch at the top of `building()`, prop `celebratePalaceId`, `celebratePalace(id)` (rise start + camera focus on next frame), read-only test hook `__map.palaceRises()`. No shop code touched.
- `components/applications/palace-celebration.tsx` (new): `usePalaceCelebration(applications)` + `PalaceCelebration`.
- `app/map/page.tsx`: 3 small edits (import, hook, prop + overlay).
- `app/map/map.module.css`: block `/* === Palace (shop-v2) === */` appended at the end.
- `tests/map-palace.test.mjs` (8 tests), `scripts/palace-e2e.mjs` (mocked Supabase, headless), screenshots in `docs/shop-v2/shots/palace/`.

## Results
- `npm run lint`: 0 errors (8 pre-existing warnings in other scripts/tests).
- `npm test`: 339/339 pass (incl. 8 new palace tests).
- `npm run build`: passes (dummy env `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` – note: the app needs `..._PUBLISHABLE_KEY`, not `..._ANON_KEY`).
- `scripts/palace-e2e.mjs` at 1280 px, 375 px and 375 px reduced motion: all checks pass (overlay text, aria-live, dismiss, seen flag, no repeat after reload, status back → house, no page errors).

## Screenshots (`docs/shop-v2/shots/palace/`)
`*-1-camera-on-palace`, `*-2-celebration`, `*-3-palace`, `*-4-status-back-house` for 1280 and 375; `375-reduced-*` for reduced motion.

## Open / notes
- The rise animation itself is too fast to catch in software-rendered (SwiftShader) screenshots; it is covered by the `palaceRiseProgress` unit test and the `__map.palaceRises()` hook.
- The old offer flag/tower code in the normal house path is now unreachable for accepted statuses (left in place to keep the diff small); legend labels "Mit Flagge…" in `lib/application-map.ts` (not owned) could be renamed to "Palast" later.
- If the user switches the status back while the card is open, card and palace disappear together (it is not marked seen, so it celebrates again on the next acceptance).
- No migration, nothing pushed or deployed.
