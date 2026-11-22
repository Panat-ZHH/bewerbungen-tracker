# QA: parent village = the child's own village, watch only (independent review, 2026-11-22)

Reviewed branch `feat/parent-village-full-details` @ 13a1660 (1 commit beyond origin/main 50947b5; build report says BUILD: PASS)
on `qa/parent-village-full-details`. I did not write this feature. Nothing was pushed or deployed, and the live DB was only
read: one read-only `pg_proc` SELECT. No probe accounts were created; the browser tests mock Supabase completely.

QA additions (separate commit): `tests/qa-parent-village-full-details-db.test.mjs`, `scripts/qa-parent-village-e2e.mjs`,
`_onboarding/parent-village-full-details/qa-*.png` + `qa-e2e-report.json`, this file. No product code changed.

## 1. Code review (`git diff origin/main...HEAD`): PASS
- **Reuse, not a copy:** the full `/map` screen was moved 1:1 into `components/applications/village-map.tsx`. `app/map/page.tsx`
  is now only `<VillageMap />`, and `/familie/kind/[id]/dorf` renders `<VillageMap watch={…} />`. The friend view
  (`ReadOnlyVillageView`) is untouched and no longer used by the parent page.
- **Write paths in watch mode** (all checked by reading the code):
  - The component loads nothing itself: `getApplications`, `map_shop_state`/reward claim and `map_islands_state` effects
    return early.
  - `useMapShop` blocks every write: `buy`, `save`, `commitMove`, `start`, `nudge` and `select` return early when `watching`.
  - `useIslands.unlock` returns early, and `affordableWith` is always false.
  - The world gets `readOnly openHouses`, `drag=lockedDrag`, `placement=null`, and the shop-item select is a no-op. Only
    `onSelect` (open a house) is kept.
  - `MapApplicationDialog readOnly`:
    - `save()` returns early.
    - The status form, «Haus verschieben» and «Bewerbung öffnen» are not rendered.
    - Notes are not rendered (and are never sent).
  - Hidden: shop button/sheet, points badge, «+» link, palace celebration, placement tools, refresh, island unlock/progress,
    and the empty-state add link.
  - No URL parameter is read by VillageMap. Keyboard: lockedDrag ignores arrows/Enter/Delete/Ctrl+Z. The E2E pressed them,
    dragged the canvas, and recorded no write.
- **Parser** (`lib/family-village.ts`) copies only the allowed fields, and unknown keys are dropped.
- `npx eslint` on all changed files: 0 problems.

## 2. Migration review: PASS
- `20261122190000_…full_details.sql` replaces only `_acc_impl_family_child_village`. It is `security definer` with
  `set search_path = ''`, and EXECUTE is revoked from public/anon/authenticated/service_role. The wrapper
  `family_child_village` (with the `_assert_app_access()` paywall guard and the authenticated-only grant) is untouched.
- The privacy gate is unchanged: active parent of the same family, active child, `_family_sharing_allowed` (consent),
  `share_settings.village`. `share_settings.applications` no longer has an effect (`show_companies` was removed).
- Per house it returns only `id, company, position, location, status, createdAt, updatedAt, appliedAt, deadline`. These are
  exactly the fields the child's own label, search and sheet show (`map-application-dialog.tsx`), except notes.
- **Rollback:** the function body in `supabase/rollback/…down.sql` is byte-identical to `20261122100000_…like_friend.sql`.
  **Live check (read-only):** md5 of `pg_get_functiondef` of the live impl = `370d832f…`, which equals the builder's backup
  `db-backup/_acc_impl_family_child_village.before-20261122190000.sql`. Live grants: impl anon/auth/service = false/false/false,
  wrapper = false/true/false, both SECURITY DEFINER with `search_path=""`.

## 3. Own leak tests (PGlite, full migration chain, Supabase default privileges): 7/7 PASS
`node --test tests/qa-parent-village-full-details-db.test.mjs`
- **Active parent:** exact key sets (top/house/item/layout). Every applications column the village doesn't show is filled
  with a `LEAK_` marker (columns discovered from information_schema, so future columns are covered too). No marker, e-mail,
  surname, family name or price leaks. The real status (`rejected`) is not masked, and an orphan layout is not returned.
- **Deny matrix:** each of these gets an error and no data, and no error text contains data: other family's parent, the
  child itself, a non-member, a sibling child, a pending parent, a removed parent, an empty session, a random child id.
  anon → permission denied (wrapper and impl). An authenticated user calling the impl directly → permission denied.
- **Child side:** village off (even with everything else on), village key missing, consent pending, consent withdrawn and a
  removed child all return NOT_SHARED / NOT_FOUND.
- **Applications toggle:** on and off give an identical result.
- **DB properties:** SECURITY DEFINER, search_path and grants as specified; the wrapper keeps `_assert_app_access()`.
- **Replay:** migration → rollback → migration (×2, idempotent). The rollback restores the old contract (`show_companies`,
  `h0001`, no company) and the 20261122100000 body, grants stay, and re-applying gives an identical payload.
- **Read-only:** an md5 snapshot of every public table is unchanged after two calls.

## 4. Toolchain
| check | result |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS (0 errors, 16 warnings; none in changed files) |
| `npx tsc --noEmit` | PASS |
| `npm test` | 1273 tests: 1260 pass, 12 skipped, **1 fail**, which is not related to this feature (see below) |
| `npm run build` | PASS (needs `.env.local`; the first try without it failed at prerender, as expected) |

The one failure is `tests/rate-limit-routes.test.mjs` «places autocomplete – instance-local limiter» (got 200, expected 429).
This branch doesn't touch that file or its route. It passed 3/3 when run on its own, so it is load-dependent timing in the
full parallel run.

## 5. Rendering (own Playwright script, real Chrome + SwiftShader WebGL, local `next start`, Supabase fully mocked): 96/96 PASS
`BASE=http://localhost:3471 PLAYWRIGHT=… node scripts/qa-parent-village-e2e.mjs`. The data is 7 demo applications covering
every stage (Zusage, Gespräch, Absage, …) plus notes, salary and link set as secrets, 2 islands, a layout and 2 items. The
parent's `family_child_village` answer uses the new contract.

Results for each of mobile 390×844 and desktop 1440×900, in light and dark:
- **House labels:** child and parent are identical (all 7: id, company, status).
- **Search list:** identical, with every company + Stelle + status.
- **Start framing:** every house label centre differs by 0 px. The child's one-time palace celebration was pre-marked as
  seen. Without that, the child's camera flies to the new palace; the parent correctly never gets that celebration.
- **Animation:** the canvas changes within 1 s.
- **House sheet (parent):** shows Stelle, company, location, all four dates and «Nur ansehen: hier kann nichts verändert
  werden.». It has no status select, «Haus verschieben», «Status speichern», `/applications/` link or notes (the child's sheet
  shows the notes and status form, as expected).
- **No edit controls in the parent DOM:** no Laden/Kaufen/Löschen/Bearbeiten/verschieben/Status/Bewerbung
  eintragen/freischalten/Drehen/Platzieren/Rückgängig, no points badge, no `/applications/new` link.
- **Island switcher:** shows the child's 2 islands (switching works, see `qa-parent-*-island2.png`), with no unlock or points.
- **Network in the parent view:** ZERO writes, even after the keyboard + drag abuse. Requests seen:
  - `GET /auth/v1/user`
  - `GET profiles`
  - `POST rpc/family_child_village`
  - the shared WorkspaceShell's `POST rpc/social_my_profile`, `rpc/my_access` and `rpc/social_list`. I checked their SQL:
    they are pure SELECT functions, loaded on every app page and already on origin/main, so they are reads, not writes.
- **Endpoints never touched by the parent view:** applications, map_shop_*, map_island*, map_claim*, map_move*.
- **Page errors:** none.

Images: `qa-side-by-side-{mobile,desktop}-{light,dark}[-house-open].png` (child left, parent right),
`qa-child-*`, `qa-parent-*`, `qa-parent-*-anim-{a,b}.png`, `qa-parent-*-island2.png`, and `qa-e2e-report.json` (all requests).

## 6. Copy: PASS (one nit)
The child's «Dorf teilen» text, the «Bewerbungsliste teilen» off text, the families page (feature tile + FAQ), Hilfe,
Datenschutzerklärung and Datenschutz für Jugendliche all say the same things:
- parents see company, Stelle and status (incl. Zusage/Absage) plus the dates;
- it is read-only;
- notes, salary, contacts, links and documents stay private;
- it can be switched off at any time, and consent is needed under 16.

The German is correct (Swiss spelling, ss).

The nit (cosmetic, not fixed): a few texts say Firma, Stelle and Status are «an den Häusern» / «an jedem Haus». The house
label shows company + status; the Stelle appears in the house sheet and the search list.

## Notes for Panat / the release
1. **Privacy-relevant default:** `share_settings.village` is **on by default** and `applications` is off. After this release,
   parents of every child who never touched the toggles will see company names, job titles and real outcomes (Absage),
   which they did not see before. This matches Panat's request, but consider a short notice to children (e.g. on /familie)
   or announcing it.
2. **Release order is unchanged from the build report:** apply the migration and deploy the app together. The new client
   also renders the old payload («Haus N»). Rollback = the `.down.sql`, which is verified identical to the live definition,
   plus the previous deploy.

QA: PASS
