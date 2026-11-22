# Parent village = friend village (build report, 2026-11-22)

Branch `fix/parent-village-identical` (based on origin/main d248777). Nothing pushed or deployed, main untouched.
**The migration is NOT applied to the live database.** Release step below.

## Root cause

Panat's photo (`_onboarding/parent-village-bug.jpg`) was reproduced exactly with probe users on an emulated Pixel 7
(`parent-village-identical/before-side-by-side-friend-left-parent-right.png`). Both routes already render the same
`ReadOnlyVillageView` + `ApplicationMapWorld`. Camera, map size, render loop and controls were already identical. In the BEFORE
run the camera was `{x:-0.167, z:0.833, zoom:1}` and the map 412×781 in both views, and both animated. The difference was
the **data** the parent RPC sends. The 3D world is deterministic in it:

1. **Results not masked.** `supabase/migrations/20261121100000_family_child_village.sql:41` sends `a.status` raw. The friend RPC
   masks results with `public._soc_friend_status` (`20261109050000_friends_privacy_defaults.sql:56,111`): `rejected`, `offer`
   and `withdrawn` become `applied` unless the owner shares them, which is the default. So the parent saw every rejection as a burnt
   ruin with «Absage erhalten» (`application-map-world.tsx:310`, `isRuin`), while the friend sees intact houses with
   «Abgeschickt». The village looks burnt down and "dead" next to the friend view. Ruins also anchor their label elsewhere
   (`:313`), which is why the labels sat in other places.
2. **Real application ids instead of pseudo ids.** `family_child_village.sql:41` sends `a.id`, the friend RPC `h0001…`
   (`friends_privacy_defaults.sql:112`). Roof colour and ruin shape are derived from the id (`application-map-world.tsx:312,318`),
   so even the intact houses had other colours (QA finding 3).
3. The labels say «Haus N» in both views, because the child shares neither company names with friends (default off) nor the
   application list with the family. That is the privacy rule and is unchanged.

"Frozen" on the phone: in real rendering (Chrome + SwiftShader WebGL; 390×844, Pixel 7, Pixel 7 + 4× CPU throttling) the parent
view animated **before** the fix too (numbers below). There is no parent-only pause, reduced-motion switch or frame-loop flag.
The "dead" impression comes from the burnt village in (1). One thing does freeze **both** views on purpose: the map
honours `prefers-reduced-motion`, which Android sets when *Settings → Accessibility → Remove animations* is on. If Panat's phone
has that switch on, the friend village is just as still there (`pixel7-reduced`: 0 px change in 1 s in both views).

## What changed

- `supabase/migrations/20261122100000_family_child_village_like_friend.sql` (new, idempotent, replaces only
  `_acc_impl_family_child_village`; wrapper, paywall guard and grants unchanged). It sends pseudo ids `h0001…` by age, layouts as
  `house:<pseudo id>`, and masks results with the **same** `_soc_friend_status`, gated by `share_settings.applications`
  («Bewerbungsliste teilen» = company names + status, `lib/family-core.ts`). This resolves QA finding 1 in the **stricter**
  direction and finding 3. Payload keys are unchanged. Rollback: `supabase/rollback/20261122100000_family_child_village_like_friend.down.sql`.
- `lib/family-village.ts` + `lib/read-only-village.ts` (`pseudoHouseId`, `maskedStatus`): the parser applies the same normalisation,
  so the UI is identical even against the old RPC that is live now. On the new payload it is a no-op.
- Tests: `tests/read-only-village.test.mjs` parity now uses the real friend default (results masked) plus the old-RPC payload
  (QA finding 2). `tests/family-village.test.mjs` adds a masking/pseudo-id test. `tests/family-child-village-db.test.mjs` (PGlite,
  full migration chain) adds pseudo ids, no real ids leaked, a new results-masking test and an equality check against `_soc_friend_status`.
- `docs/family/parent-village-contract.md`: note on the new semantics.
- No change to the page, `ReadOnlyVillageView` or the 3D world. Read-only mode and the privacy gates are unchanged.

Behaviour change Panat should know about: parents no longer see «Absage» / «Zusage» (ruin / palace) unless the child also shares
the application list with the family. This is exactly how friends see the village. To show results to parents
always, change one argument in the migration (`_soc_friend_status(a.status, true)`) and in `lib/family-village.ts`
(`maskedStatus(..., true)`). The views then differ again by design.

## Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS – 0 errors (16 old warnings in untouched files) |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS – 1267 tests, 1255 passed, 0 failed, 12 skipped (live RLS audit without env) |
| `npm run build` | PASS (this build was used for the AFTER e2e; later edits touched only the test script, tests and docs) |

## E2E (real rendering, real Supabase, probe users)

Rerun:
```
npm run build && npx next start -p 3427 &
PHASE=after BASE=http://localhost:3427 node scripts/parent-village-identical-e2e.mjs
```
The script creates `probe-pv-<stamp>-{parent,child,friend}@example.invalid`: a child with 12 applications (6 rejected), a family
with the village shared and the application list not shared, and a friendship with the app defaults. It renders `/friends/<child>`
and `/familie/kind/<child>/dorf` for 4 profiles and deletes all probes in `finally` / on SIGINT. It also sweeps
`probe-pv-*` leftovers first. Both runs ended with `cleanup verified: no probe-pv-* account left`. The service key comes
from `~/JARVIS/bin/sb` and is never printed. The script exits 1 if any check fails. Reports:
`parent-village-identical/{before,after}-report.json`.

Note: the AFTER run used the **live (old) RPC**, so it proves the client normalisation. The migration is proven by the PGlite DB tests.

### BEFORE (main) – `E2E FAIL (9)`
| Profile | friend anim. (px changed f1→f2 / f2→f3) | parent anim. | camera equal | labels equal | friend vs parent first frame |
|---|---|---|---|---|---|
| 390×844 | 81 790 / 66 733 | 89 046 / 100 738 | yes | **no** (Absage vs Abgeschickt) | 689 633 px (25 %) |
| Pixel 7 | 85 317 / 82 360 | 62 906 / 72 183 | yes | **no** | 554 195 px (24.99 %) |
| Pixel 7 + CPU 4× | 37 407 / 89 176 | 84 476 / 73 328 | yes | **no** | 549 773 px (24.79 %) |
| Pixel 7 reduced motion | 0 (still, by design) | 0 | yes | **no** | 519 564 px (23.42 %) |

### AFTER (this branch) – `E2E PASS`
| Profile | friend anim. | parent anim. | camera equal | labels + positions equal | friend vs parent |
|---|---|---|---|---|---|
| 390×844 | 86 861 / 80 593 | 95 560 / 81 679 | yes | yes | 3.8 % scene (animation phase only) |
| Pixel 7 | 79 338 / 53 608 | 53 732 / 83 573 | yes | yes | 4.14 % scene (animation phase only) |
| Pixel 7 + CPU 4× | 86 549 / 59 041 | 71 770 / 76 189 | yes | yes | 4 % scene (animation phase only) |
| Pixel 7 reduced motion | 0 (still) | 0 (still) | yes | yes | **0 px** below the top bar; 12 143 px (0.55 %) whole frame = only the owner chip (friend avatar vs home icon, intended) |

The camera was `{x:-0.1667, z:0.8333, zoom:1}` in every view. The map was 412×781 (Pixel 7) and 390×786 (390×844) in both.
Console errors 0 and write requests 0 in all 16 views.

Images (`_onboarding/parent-village-identical/`): `before-friend.png`, `before-parent.png`, `after-friend.png`, `after-parent.png`
(Pixel 7, first frame); `{before,after}-side-by-side-friend-left-parent-right.png`; animation diffs (magenta = changed in 1 s)
`{before,after}-{friend,parent}-pixel7-diff12.png`, `after-parent-pixel7-cpu4-diff12.png`; friend vs parent with motion off
`{before,after}-friend-vs-parent-pixel7-reduced-diff.png`.

## Release (not done here)

1. Apply `supabase/migrations/20261122100000_family_child_village_like_friend.sql` to project bhwreehwirrloxagyypi (PRIVAT).
2. Deploy the app. The order does not matter: the client gives the same view with the old or new RPC.

BUILD: PASS
