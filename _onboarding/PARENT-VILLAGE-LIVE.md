# Parent village = friend village: LIVE (2026-11-22)

**Status: LIVE on https://wendapply.ch.** Gate: `PARENT-VILLAGE-IDENTICAL-BUILD.md` → BUILD: PASS, `PARENT-VILLAGE-IDENTICAL-QA.md` → QA: PASS.
(This replaces the earlier release report for d8d2b03; that fix was live but did not solve Panat's Android photo.)

| | |
|---|---|
| New production deploy | `6b030b4a7b4d419927ca363d` (commit `e0b6c14`, published 2026-11-22 15:34 UTC) |
| Rollback deploy | `6b02f7b7c586c564ca000ce9` (commit `d248777`): `netlify api restoreSiteDeploy --data '{"site_id":"b96bc70c-8324-4bb9-a4ef-70877581f8bd","deploy_id":"6b02f7b7c586c564ca000ce9"}'` |
| DB migration | `20261122100000_family_child_village_like_friend.sql` applied to bhwreehwirrloxagyypi (PRIVAT) and recorded in `supabase_migrations.schema_migrations` |
| DB rollback | `supabase/rollback/20261122100000_family_child_village_like_friend.down.sql`, or the exact pre-migration live definition: `_onboarding/parent-village-identical/db-backup/_acc_impl_family_child_village.before-20261122.sql` |

## Root cause

The 3D component, camera, map size and render loop were already identical for parent and friend. The **data** differed:

1. The parent RPC `family_child_village` sent raw application results. The friend RPC masks `rejected`/`offer`/`withdrawn` as `applied`
   unless results are shared (the default). So the parent saw burnt ruins with «Absage erhalten» and labels anchored elsewhere, while the friend sees normal houses with «Abgeschickt».
2. The parent RPC sent real application ids, the friend RPC pseudo ids `h0001…`. Roof colour and ruin shape are derived from the id, so the colours differed too.
3. The "frozen" look: in emulation (390×844, Pixel 7, Pixel 7 with 4× CPU throttling) the parent view animated before and after the fix.
   The dead look came from the burnt village. If Android *Settings → Accessibility → Remove animations* is on, **both** views are still by design (`prefers-reduced-motion`).
4. The close zoom on a few houses is the default start camera, the same in the friend view.

## What changed

- DB: `_acc_impl_family_child_village` now sends pseudo ids, layouts as `house:<pseudo id>`, and masks results with the same `_soc_friend_status`, gated by
  `share_settings.applications`. The wrapper, paywall guard and grants are unchanged. Checked after applying: the new definition is active, `authenticated` cannot execute the impl, and `anon` cannot execute the wrapper.
- Client: `lib/family-village.ts` and `lib/read-only-village.ts` (`pseudoHouseId`, `maskedStatus`) apply the same normalisation, plus tests and the contract doc.
- Intended behaviour change: parents see «Absage»/«Zusage» only if the child shares the application list with the family, exactly like friends.

## Test evidence

Release worktree (main e0b6c14): `npm ci`, lint, `npx tsc --noEmit` all PASS. `npm test`: 1267 tests, 1255 pass, 0 fail, 12 skipped. `npm run build`: PASS.

Images in `_onboarding/parent-village-identical/`:
- Before: `before-side-by-side-friend-left-parent-right.png`, `before-friend.png`, `before-parent.png`
- After: `after-side-by-side-friend-left-parent-right.png`, `after-friend.png`, `after-parent.png`, animation diffs `after-*-diff12.png`
- QA: `qa-side-by-side-friend-left-parent-right.png`, `qa-friend-pixel7.png`, `qa-parent-pixel7.png`, `qa-*-anim-diff12.png`, privacy `qa-privacy-*.png`

Live checks after deploy:
- `/` 200, `/login` 200, `/familie/kind/<random uuid>/dorf` 200 app shell with a client-side redirect to login (as before), no 500.
- The deployed chunk `/_next/static/chunks/32hx5p66rl5fy.js` contains the new `maskedStatus` (`["saved","preparing","applied","interview","final_interview"]`) and `pseudoHouseId` (`h${…padStart(4,"0")}`).

## For Panat (Android)

Open a child's village as parent and the same child's village as friend on the same phone. They should look the same: no ruins unless results are shared, same roof colours, same labels.
If both are still, check *Settings → Accessibility → Remove animations*.
