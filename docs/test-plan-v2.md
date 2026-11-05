# Test plan v2 (Part D: Test Engineer, branch `tests-v2`)

Run everything: `npm run lint && npx tsc --noEmit && npm test && npm run test:e2e`.

* **Unit / SQL** (`npm test`, node --test, PGlite for SQL): `tests/*.test.mjs`; helpers in `tests/helpers/` (alias loader so `lib/*.ts` files with `@/` imports can be tested with a stubbed Supabase client).
* **E2E** (`npm run test:e2e` = `scripts/e2e-all.mjs`): headless Chrome via playwright-core, all Supabase traffic answered by the stateful in-memory mock `scripts/lib/mock-supabase.mjs`. Each flow runs on desktop 1280x800 and mobile 390x844 (touch), in light and dark. Every page load asserts: no console errors, no failed requests (except stubbed ones), no horizontal overflow, no uncaught exceptions. Options: `--only=map`, `--skip=map`, `--flow=<name>`, `--profile=`, `--theme=`; env `BASE`, `E2E_SPAWN=1`, `OUT`, `CHROME`, `PLAYWRIGHT`. Screenshots + `summary.json` go to `screenshots/v2/tests/` (failures in `failures/`).
* Component tests with react-dom/server or jsdom were **not added** (no new dependencies, as agreed); components are covered through the E2E flows.

## Coverage matrix: lib/

| File | Covered by | Notes |
|---|---|---|
| application-map.ts | application-map.test.mjs | |
| avatar.ts | avatar.test.mjs (+ PGlite for avatar migration) | |
| avatar-image.ts, avatar-storage.ts | E2E `profile-avatar` (canvas / upload, NEXT_PUBLIC_AVATAR_LOCAL=1) | browser-only APIs |
| classes.ts | classes.test.mjs (SQL RPCs), **lib-pure.test.mjs** (error codes, link, row mapping) | |
| social.ts | social.test.mjs (SQL), **lib-pure.test.mjs** | |
| friend-badge.ts | friend-badge.test.mjs, **lib-pure.test.mjs** | |
| friend-island.ts | friend-island.test.mjs; E2E `friend-island` | |
| friend-requests.ts | E2E `friends` (badge) | thin wrapper |
| islands.ts | islands.test.mjs | |
| islands-config.ts | islands.test.mjs, **lib-pure.test.mjs** (geometry/price consistency) | |
| islands-storage.ts | E2E `map` (unlock via RPC) | thin RPC wrapper |
| island-scenery.ts, map-renderer.ts, map-villager.ts, map-shop-models.ts | map-renderer/map-villager tests, E2E `map` | three.js, rendering checked in E2E (WebGL swiftshader) |
| job-search.ts | job-search.test.mjs | |
| job-results.ts | job-search.test.mjs, **lib-pure.test.mjs** (`originalSourceName`, idempotence) | |
| map-drag.ts | map-drag.test.mjs | not owned by D |
| map-shop.ts | map-shop.test.mjs (+PGlite RPCs) | |
| map-readonly.ts | E2E `friend-island` | |
| match-score.ts | **lib-pure.test.mjs** (new) | bounds over all categories x CV types |
| utils.ts | **lib-pure.test.mjs**, zusage-rename.test.mjs | |
| storage.ts | E2E (every CRUD flow goes through it) | needs Supabase client |
| supabase.ts | E2E | env-guarded client |

## SQL

| What | Test |
|---|---|
| All `supabase/migrations/*.sql` apply in order on an empty DB | **migrations.test.mjs** |
| Naming/ordering of migrations | **migrations.test.mjs** |
| RLS enabled on every public table | **migrations.test.mjs** |
| Every SECURITY DEFINER function (non-trigger) pins `search_path`, not executable by `anon` | **migrations.test.mjs** |
| RLS isolation of `applications` (select/insert/update/delete across users, anonymous sees nothing) | **migrations.test.mjs** |
| Second run of every migration does not fail (idempotent) | **migrations.test.mjs** |
| `schema.sql`/`social.sql` == migration copies | classes.test.mjs |
| Social, classes, shop, islands, friend island, avatars RPC behaviour | social/classes/map-shop/islands/friend-island/avatar tests |

## E2E flows (scripts/e2e-all.mjs)

| Flow | Desktop+mobile, light+dark |
|---|---|
| login | login screen, wrong credentials message, signup password mismatch, anonymous redirect, successful sign-in |
| onboarding-empty | empty dashboard shows first-application CTA |
| application-crud | add, status -> Zusage (stored `offer`), list badge, edit, delete (+undo if offered) |
| search-filter | list, text search, no hits, status chips |
| analytics-cvs | analytics page, CV list |
| profile-avatar | profile edit, avatar upload (needs `NEXT_PUBLIC_AVATAR_LOCAL=1`, else SKIP) |
| settings-theme | theme toggle persists after reload |
| friends | list, request badge, invite by code, accept |
| friend-island | read-only `/friends/mock-friend` |
| classes-student / classes-teacher | join preview, bad code, sharing toggle; class list, overview, filter, drilldown |
| navigation | nav links, mobile tab bar + "Mehr" sheet |
| not-found | 404 page + link home |
| map (separate section, `--only=map`) | loads + WebGL canvas, islands switcher, zoom controls, shop buy, place, move house, persistence after reload |

## Known gaps

* No component-level tests (see above); no visual-regression diffing (screenshots are for humans).
* `storage.ts`/`avatar-*.ts` have no isolated unit tests (need a Supabase/browser).
* Real Supabase, Auth emails, Netlify behaviour are never touched.
* Map flows use tolerant selectors; "move house" is SKIPPED on mobile when the dialog button is absent.
