# Parent village = the child's own village, watch only (build report, 2026-11-22)

Branch `feat/parent-village-full-details` (based on origin/main 50947b5). **Nothing pushed, nothing deployed, migration NOT applied
to the live DB** (release agent). Requirement (Panat, 2026-11-22 19:06): parents see exactly what the child sees in its own village,
including real company, Stelle, real status (incl. Absage/Zusage) and dates, not «Haus 1 – Absage erhalten». Strictly watch only.

## What changed

### UI: one component, `readOnly` = `watch`
- **`components/applications/village-map.tsx` (new): the child's `/map` screen, moved 1:1 out of `app/map/page.tsx`**, plus a
  `watch` prop. `app/map/page.tsx` now renders `<VillageMap />`, `/familie/kind/[id]/dorf` renders `<VillageMap watch={…} />`.
  The parent page no longer uses `ReadOnlyVillageView` (that stays only for the friend view, unchanged).
  Same 3D world, camera/start framing, island switcher, house labels, search/filter/legend, house sheet, night mode.
- In `watch` mode:
  - nothing is loaded by the component: no `getApplications`, no `map_shop_state` / reward claim, no shop catalogue, no `map_islands`
    (data comes only from the page's `family_child_village` call);
  - hidden: shop button + sheet, points badge, «Bewerbung eintragen» (+), palace celebration, placement tools, refresh button,
    island unlock/progress («Insel freischalten»), empty-state add link;
  - world: `readOnly` + new `openHouses` → drag locked (`lockedDrag`), no placement, no shop-item selection; only tapping a house
    (label or 3D) opens its sheet;
  - house sheet (`MapApplicationDialog readOnly`): same title (Stelle), company, status badge, location, dates; **no** status
    form/select, no «Haus verschieben», no «Bewerbung öffnen», no notes; shows «Nur ansehen: hier kann nichts verändert werden.»;
  - top bar: back to «Familie», island chip titled «Dorf von <Name>», search, and an «Nur ansehen» info chip.
- Defense in depth: `useMapShop(…, watch)` and `useIslands(…, watchUnlocked)` skip loading and every write path returns early
  (`buy`, `save`, `commitMove`/drag/undo, `start`, `nudge`, `select`, `unlock`).
- `application-map-world.tsx`: `openHouses` prop (only effective with `readOnly`). Friends never pass it → unchanged.

### DB
- `supabase/migrations/20261122190000_family_child_village_full_details.sql`: replaces only `_acc_impl_family_child_village`.
  Wrapper `family_child_village`, paywall guard (`_assert_app_access`), SECURITY DEFINER, `search_path=''`, grants unchanged
  (EXECUTE: wrapper → `authenticated` only; impl → nobody). Privacy gate unchanged: active parent of the same family, active child,
  `_family_sharing_allowed` (consent), `share_settings.village = true`. **`share_settings.applications` no longer affects this RPC;
  the `show_companies` key is removed.**
- Rollback: `supabase/rollback/20261122190000_family_child_village_full_details.down.sql` = exactly the 20261122100000 definition.
- Live backup (read-only `select pg_get_functiondef(...)`, no writes): `_onboarding/parent-village-full-details/db-backup/_acc_impl_family_child_village.before-20261122190000.sql`.
  **Confirmed identical** to the body of migration 20261122100000 (only the `$$`/`$function$` delimiter differs). Live grants checked
  read-only: impl not executable by anon/authenticated/service_role; wrapper only by authenticated.

### Fields returned per house (and why)
Exactly what the child's own village shows (`village-map.tsx` label/search + `map-application-dialog.tsx`):

| field | shown where in the child's village |
|---|---|
| `id` (real application id) | 3D world: roof colour / ruin shape and house identity; layouts `house:<id>` |
| `company` (raw) | house label, sheet subtitle, search list |
| `position` | sheet title, search list |
| `location` (null if empty) | sheet (pin), search |
| `status` (real, never masked) | label, sheet badge, building look (palace / ruin / construction) |
| `createdAt` | «Erfasst am»; house order on the map |
| `updatedAt` | «Letzte Änderung» |
| `appliedAt` | «Abgeschickt am» |
| `deadline` | «Bewerbungsfrist» |

Plus unchanged top level: `child_id`, `display_name`, `island_count`, `layouts` (house layouts of existing houses, real ids), `items`.
**Not returned:** notes (the child's sheet shows «Deine Notizen», but notes are private by product promise and all privacy copy —
decision for Panat if that should ever change), salary/currency, job_url, source, job description, match score, CV type, contacts,
Schnupper/test details, documents/CVs, points/wallet.

### Client lib, tests, docs
- `lib/family-village.ts`: new parser (real ids, full fields, no masking; tolerates the old payload with «Haus N»); new info copy.
- `lib/read-only-village.ts`: removed `pseudoHouseId` / `maskedStatus` (no longer used); friend props unchanged.
- Tests: `tests/family-child-village-db.test.mjs` (PGlite, full migration chain): full-data contract, row-by-row equality with the
  child's applications, real results regardless of `applications` sharing, **deny matrix** (other family's parent, non-parent,
  child itself, pending parent, revoked parent, village off, consent withdrawn), **replay migration → rollback → migration**,
  idempotency, grants, read-only. `tests/family-village.test.mjs`, `tests/read-only-village.test.mjs` (parent = child's own village
  props and positions), plus source checks of the watch gates; `friend-island`, `map-palace`, `zusage-rename` tests point at the moved code.
- `docs/family/parent-village-contract.md` updated to the new contract.

## Copy (Panat: please review). Old vs new

**Datenschutzerklärung** (`docs/legal/datenschutzerklaerung.md`, Eltern):
- OLD: «Teilst du dein **Dorf**, sieht das Elternteil dein echtes Dorf (Inseln, Häuser, Deko) **nur zum Anschauen**. Firmennamen an den Häusern sieht es nur, wenn du auch die **Bewerbungsliste** teilst.»
- NEW: «Teilst du dein **Dorf**, sieht das Elternteil dein echtes Dorf (Inseln, Häuser, Deko) genau so wie du, **nur zum Anschauen**: pro Bewerbung **Firma, Stelle, Status** (auch Zusage oder Absage), Ort und Daten (erfasst, zuletzt geändert, abgeschickt, Bewerbungsfrist). Ändern, verschieben oder kaufen kann es nichts.»
- (The following sentence is unchanged: «**Notizen, Lohnangaben, Ansprechpersonen, Links und Dokumente** sieht es nie, …»)

**Datenschutz für Jugendliche** (`docs/legal/datenschutz-jugend.md`):
- OLD: «Teilst du dein **Dorf**, sehen sie dein echtes Dorf mit Inseln, Häusern und Deko, **nur zum Anschauen**. Firmennamen an den Häusern sehen sie nur, wenn du auch deine **Bewerbungsliste** teilst.»
- NEW: «Teilst du dein **Dorf**, sehen sie dein echtes Dorf genau so wie du, **nur zum Anschauen**: Inseln, Häuser und Deko, an jedem Haus **Firma, Stelle und Status** (auch Zusage oder Absage) und beim Antippen die Daten (Ort, erfasst, geändert, abgeschickt, Frist). Ändern können sie nichts.»

Legal «Stand» moved to **22. November 2026** in all legal docs + `LEGAL_STAND` (one shared Stand; version unchanged 0.9 Entwurf).

**Child's «Dorf teilen» toggle** (`lib/family-core.ts`):
- OLD: «Deine Eltern sehen dein echtes Dorf mit Inseln, Häusern und Deko, nur zum Anschauen. Firmennamen an den Häusern sehen sie nur, wenn du auch die Bewerbungsliste teilst. Notizen, Lohn, Kontakte, Links und Dokumente nie. …»
- NEW: «Deine Eltern sehen dein echtes Dorf genau so wie du: Inseln, Häuser und Deko, an jedem Haus Firma, Stelle und Status (auch Zusage oder Absage) und beim Antippen die Daten. Nur zum Anschauen, sie können nichts verändern. Notizen, Lohn, Kontakte, Links und Dokumente sehen sie nie. Schaltest du es aus, sehen sie dein Dorf sofort nicht mehr.»
- «Bewerbungsliste teilen» off-text OLD «Firmen und Stellen bleiben privat.» → NEW «Die Liste bleibt privat. Teilst du dein Dorf, stehen Firma, Stelle und Status trotzdem an den Häusern.» (on-text: «… sind als Liste sichtbar …»)

**/familien** FAQ «Kann ich das Dorf meines Kindes sehen?»: «Firmennamen an den Häusern erscheinen nur, wenn Ihr Kind auch die
Bewerbungsliste teilt.» → «Sie sehen das echte Dorf genau so wie Ihr Kind: … an jedem Haus Firma, Stelle und Status (auch Zusage oder
Absage) und beim Antippen die Daten der Bewerbung. Nur zum Anschauen … Notizen, Lohnangaben, Kontakte, Links und Dokumente sehen Sie nicht.»
Also «Sehe ich als Elternteil alle Bewerbungen und Notizen?» and the «Fortschritt sehen» card now mention Firma/Stelle in the village;
`/hilfe` «Was sehen Eltern?» likewise.

**Important for Panat:** `DEFAULT_SHARE.village` is `true`. So by default (child under 16 after consent, or 16+), parents now see
company names, Stellen and Absagen in the village, where before they saw anonymous houses unless the list was shared. That is what
was asked; the copy above says it plainly. If the default should change, that is a one-line decision in `lib/family-core.ts`.

## Checks

| Command | Result |
|---|---|
| `npm ci` | PASS |
| `npm run lint` | PASS – 0 errors, 16 warnings (all pre-existing, untouched files: scripts/, tests/helpers, docs/ux-review) |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS – 1266 tests, 1254 pass, **0 fail**, 12 skipped (live RLS audit without env, as on main) |
| `npm run build` | PASS |
| `node --test tests/family-child-village-db.test.mjs` | 15/15 PASS (incl. migration → rollback → migration replay) |
| `scripts/parent-village-full-details-e2e.mjs` | **E2E PASS – 118 checks, 0 fail** |

### E2E (real rendering, `next start` of this build, Chrome + SwiftShader WebGL)
Probe users only (`probe-pvfd-<stamp>-*@example.invalid`, parent + child, 8 probe applications, a moved house, 3 items), all deleted
at the end (verified: 0 probe accounts, 0 probe applications left). The live DB still runs 20261122100000, so the parent's real
`POST /rest/v1/rpc/family_child_village` goes to the server (HTTP 200 = live privacy gate lets the active parent through) and the
response is replaced at network level with the NEW contract, built from the probe rows exactly like the new SQL.
For 390×844 mobile and 1440×900 desktop, light and dark:
- child `/map` and parent view: same labels (real company + real status, Zusage and Absage visible, no «Haus N»), the same labels on
  screen at the same positions, every house at the same map position (real ids, moved house), same start camera;
- animation: two screenshots 1 s apart differ in both views (parent 3.05–3.25 % of pixels, child 2.75–3.13 %);
- parent DOM: no shop/buy, add, points, unlock, status select, edit/move/delete/open controls, forms or palace celebration
  (sanity: the child's view has them); dragging a house in the parent view moves nothing;
- opening the Zusage house: parent sheet shows Stelle, company, Basel, «Zusage», «Letzte Änderung», «Erfasst am», «Abgeschickt am»,
  same dates as the child's sheet; no form/select/inputs, no notes or contacts;
- network: parent view requests = `GET /auth/v1/user`, `POST rpc/family_child_village`, and the **global app shell** (WorkspaceShell,
  on every logged-in page, also on the child's `/map` and before this change): `POST rpc/my_access` (STABLE), `POST rpc/social_my_profile`,
  `POST rpc/social_list`, `GET /rest/v1/profiles` (own onboarding flags). **Zero PATCH/PUT/DELETE, zero table requests for village data,
  no other RPC.** Deviation from the brief's literal "no other rpc": these three shell RPCs are POST by PostgREST convention but read
  only the caller's own rows; the only possible write in them is `_soc_ensure` creating the caller's OWN `user_roles` row if missing
  (no-op for existing accounts). They are not part of the village and were left untouched.
- Observation: right after load, the parent's off-screen labels briefly reported stale positions via `getBoundingClientRect`
  before the render loop updated them; both screenshots show correct, stable labels and the position check uses the post-frame state.

Images (`_onboarding/parent-village-full-details/`):
- `side-by-side-{mobile,desktop}-{light,dark}.png` – child `/map` left, parent right
- `side-by-side-{mobile,desktop}-{light,dark}-house-open.png` – house sheet: child (editable) left, parent (read-only) right
- `child-*.png`, `parent-*.png`, `parent-*-house-open.png` – single views; `*-anim-diff.png` – changed pixels within 1 s (magenta)
- `e2e-report.json` – all checks, cameras, labels, requests; `db-backup/` – live function definition before this migration

## Release notes for the release agent
1. Apply `20261122190000_family_child_village_full_details.sql` to bhwreehwirrloxagyypi and deploy the app **together** (the new
   client also renders the old payload, with «Haus N» labels, but the details only come with the new RPC).
2. Rollback: run the `.down.sql` (or the db-backup file) + restore the previous deploy.
3. Panat should review the Datenschutz wording above before or with the release.

BUILD: PASS
