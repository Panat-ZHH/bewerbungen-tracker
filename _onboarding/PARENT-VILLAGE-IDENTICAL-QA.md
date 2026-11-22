# Parent village = friend village: independent QA (2026-11-22)

I'm a fresh reviewer and wrote none of this code. I reviewed branch `fix/parent-village-identical` (`14b8264` fix, `d7b67e7` build report),
checked out as `qa/parent-village-identical` in `~/Projects/bewerbungen-tracker-wt/pv-identical-qa`. Nothing was pushed or deployed. The live database was
not changed: the migration is **not** applied, and probe users were the only writes. The builder report says `BUILD: PASS`, and the branch has a fix commit.

## Verdict in short

The parent view and the friend view are now the same screen with the same data. Camera, initial framing, labels, label positions,
animation loop and controls are equal in all profiles. With motion off, the still frames are **pixel-identical** (0 px) below the top bar.
Privacy gating is unchanged from origin/main, and every negative case is refused. The friend view is untouched.

## What the diff does (reviewed `git diff origin/main...fix/parent-village-identical`)

- Both routes were already rendering the same `ReadOnlyVillageView` → `ApplicationMapWorld`. I confirmed this in `app/familie/kind/[id]/dorf/page.tsx`
  and `components/friends/friend-island-view.tsx`. There is no parent-only frame-loop, camera or reduced-motion switch. The pages and components
  are not changed by the branch.
- The real difference was the **data**. The parent RPC sent raw results (`rejected` → burnt ruin «Absage erhalten», as in Panat's photo) and real
  application UUIDs (roof colour and ruin shape are derived from the id). The friend RPC sends pseudo ids `h0001…` and masks results via
  `_soc_friend_status`.
- Fix, server side: `20261122100000_family_child_village_like_friend.sql` replaces only `_acc_impl_family_child_village`. I diffed its guard
  block against the original `20261121100000_family_child_village.sql`. It is **identical**: active parent, active child in the same family,
  `_family_sharing_allowed`, and `share_settings.village`. The house and layout CTE matches `map_friend_island` (same `row_number() over (created_at, id)`).
  Grants: the impl is revoked from anon, authenticated and service_role, and the wrapper is unchanged.
- Fix, client side: `parseFamilyVillage` applies the same pseudo ids and masking, so the UI is already correct against the old live RPC.
  `maskedStatus` mirrors `_soc_friend_status` exactly (open statuses: saved, preparing, applied, interview, final_interview).
- I found no bugs in the diff. Minor, non-blocking: the client derives pseudo ids from the index *after* filtering unknown statuses, while the server
  numbers all rows. They would only diverge if the DB held a status outside `STATUS_ORDER`, which the friend parser shares anyway.

## Checks I reran myself

| Command | Result |
|---|---|
| `npm ci` | OK |
| `npm run lint` | PASS: 0 errors, 16 pre-existing warnings |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS: 1267 tests, 1255 pass, 0 fail, 12 skipped (live RLS audit without env) |
| `npm run build` | PASS |
| Builder e2e `PHASE=qa-rerun node scripts/parent-village-identical-e2e.mjs` | **E2E PASS**, probes cleaned (report `parent-village-identical/qa-rerun-report.json`) |
| My own e2e `node scripts/qa-parent-village-identical.mjs` | **QA E2E PASS**, 0 failures, probes cleaned (report `parent-village-identical/qa-report.json`) |

## My independent e2e (scripts/qa-parent-village-identical.mjs)

Setup: Chrome with SwiftShader WebGL against `next start` on this branch, using the real Supabase project bhwreehwirrloxagyypi.
I used my own probe prefix `probe-pvqa-<stamp>-*@example.invalid` (parent, child, friend, and an unlinked "stranger" parent with its own family).
The child has 14 applications, including rejected, offer, withdrawn and final_interview. It also has a **moved house** (`map_layouts`), 2 placed shop items plus 1 unplaced,
and its family share is village on with the list off. Friend defaults apply. All 4 probes and 2 families were deleted, verified with 0 `probe-pvqa-*` accounts left.

API level (live, old RPC + new client parser): parsed houses (id, status, label), layouts (`house:h0002` moved) and items are **equal** for parent and friend.
The parent payload contains no company, position or notes.

Rendering, 3 frames 1 s apart (px changed, threshold RGB sum > 24):

| Profile | friend f1→f2 / f2→f3 | parent f1→f2 / f2→f3 | camera (both) | labels + positions | friend vs parent |
|---|---|---|---|---|---|
| 390×844 | 43 491 / 35 520 | 40 442 / 46 126 | {x 2.833, z 2.167, zoom 1} | equal | 0.81 % (animation phase only) |
| Pixel 7 | 24 356 / 44 474 | 27 018 / 36 771 | same | equal | 0.83 % (animation phase only) |
| Pixel 7 + CDP CPU throttle 4× | 30 689 / 50 657 | 31 579 / 46 721 | same | equal | 1.18 % (animation phase only) |
| Pixel 7, reduced motion | 0 (still by design) | 0 | same | equal | **0 px** below the top bar |

In all 8 views there were 0 console errors and 0 write requests, also after a drag gesture. The parent view has no shop, coins or edit controls, and its labels
show no result («Absage»/«Zusage») because the list is not shared. Map box: 412×781 (Pixel 7) and 390×786 (390×844) in both views.

Privacy (all refused, no houses rendered):
- anonymous RPC: `permission denied for function family_child_village`; anonymous page → redirected to `/login`
- unlinked parent (other family): RPC `NOT_FOUND`; page «Dorf nicht verfügbar»
- friend calling the parent RPC: `NOT_IN_FAMILY`; the child itself: `FORBIDDEN`
- child switches the village off: `NOT_SHARED`; page «Dorf nicht geteilt»
- child removed from the family (inactive link): `NOT_FOUND`; page «Dorf nicht verfügbar»
- positive: the child shares the application list → the parent gets company names and real results (intended), still no notes.

Friend view not regressed: the branch does not touch `lib/friend-island.ts`, `friend-island-view.tsx`, `ReadOnlyVillageView` or the 3D world.
`lib/read-only-village.ts` only gains two exports. The friend view rendered, animated and passed every check above.

Images (`_onboarding/parent-village-identical/`):
- `qa-side-by-side-friend-left-parent-right.png`, `qa-friend-pixel7.png` and `qa-parent-pixel7.png`: the first frame, visually identical
- animation diffs (magenta = changed in 1 s): `qa-{friend,parent}-{390,pixel7,pixel7-cpu4}-anim-diff12.png`
- `qa-friend-vs-parent-pixel7-still-diff.png`: friend vs parent with motion off (only the owner chip in the top bar differs)
- privacy: `qa-privacy-{anonymous,unlinked-parent,village-off,removed-link}.png`

## Notes and residual risks for release

1. **Apply the migration.** Until `20261122100000_family_child_village_like_friend.sql` runs on bhwreehwirrloxagyypi, the live RPC still sends parents the
   raw results and real application UUIDs. The UI hides them, but they are visible in devtools. This was already the case on main, so it is not a regression,
   but the release should apply the migration.
2. **Framing.** The "close zoom on a few houses" is the app's default initial camera. The friend view opens the same way
   (camera `zoom 1`, same position). After the fix, what differed in the photo (ruins, «Absage» labels, label anchors, roof colours) is gone.
3. **"No animations" on Panat's phone.** Emulation can't reproduce a frozen parent view: it animated before and after, with and without 4× CPU throttling.
   If Android's *Remove animations* (reduced motion) is on, **both** views are still by design. Panat should re-test on the phone after release
   and compare against a friend village on the same phone.
4. Behaviour change (intended, stricter): parents see «Absage»/«Zusage» only if the child shares the application list.

My only commit adds the QA script and this report. No product-code fixes were needed.

QA: PASS
