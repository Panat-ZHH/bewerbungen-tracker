# Parent village view – report (2026-11-21)

Branch `parent-village` (merges `pv-db` 8d257f5, `pv-ui` f2057a3, `pv-legal` 8f7ac25, then 75ef8fc contract fix and 5889c04 screenshots + two visual fixes).
Not merged to main, not in production, migration NOT applied to the live DB (bhwreehwirrloxagyypi).

## What was built
- A parent (active `parent` in a family) can open their child's **real** village **read-only**: button «Dorf ansehen» on the child's card on `/familie`
  → page `/familie/kind/[id]/dorf` (`app/familie/kind/[id]/dorf/page.tsx`, loader `lib/family-village.ts`).
- Same 3D village as the child sees (islands, houses, moved layouts, bought items), but no editing, no shop, no wallet.
- Company names on the houses only if the child shares applications; otherwise neutral houses.
- Clear messages when the village is not visible (consent pending/withdrawn, village sharing off, not your child).
- Copy and legal text (privacy / family info) updated: parents can see the child's village, read-only, only if the child shares it.

## RPC contract
`family_child_village(p_child_id uuid)` – migration `supabase/migrations/20261121100000_family_child_village.sql`,
rollback `supabase/rollback/20261121100000_family_child_village.down.sql`. Full contract: `docs/family/parent-village-contract.md`.
- `SECURITY DEFINER`, `search_path = ''`, EXECUTE for `authenticated` only; wrapped by `_acc_wrap(..., 'all')` (paywall guard like `family_child_overview`).
- Returns only `child_id, display_name, island_count, show_companies, houses[{id,status,company}], layouts[], items[]`.
- Errors (P0001): `AUTH_REQUIRED`, `NOT_IN_FAMILY`, `FORBIDDEN`, `NOT_FOUND`, `NOT_SHARED` (hint `consent_pending` | `consent_withdrawn` | `village_off`), `PAYWALL`.

## Privacy rules
- Caller must be an active parent of the **same** family; the child must be an active child there.
- Consent required (under 16) via `_family_sharing_allowed`; withdrawing consent hides the village immediately (checked on every call).
- Child decides: `share_settings.village = false` hides the village; company names only with `share_settings.applications = true`.
- Never returned: notes, salary, position, location, links, source, job description, deadlines, contacts, files/CVs, wallet, classes, schools, other families.
- The function writes nothing; the page only calls this RPC.

## Tests and results
- `tests/family-child-village-db.test.mjs` + `tests/family-village.test.mjs`: 16/16 pass (re-run 2026-11-21 on this branch; PGlite with the full migration chain).
- Full unit suite on the builder branches: pass (pv-legal: 1229 pass, 0 fail, 12 skipped). Build ok (Netlify build of the preview succeeded).
- Known: `family-app` and `family-student-flow` scripts also fail on main itself → not caused by this branch.

## Screenshots (demo data only) – `docs/family/parent-village/`
36 images, each desktop/mobile × light/dark:
`familie-card` (button visible), `familie-card-unshared`, `dorf-companies`, `dorf-companies-info`, `dorf-no-companies`,
`dorf-no-companies-info`, `dorf-not-shared`, `child-share-on`, `child-share-off`.

## Preview
https://parent-village--bewerbungen-pawat.netlify.app (draft alias, context deploy-preview, NOT production).
`/`, `/familie`, `/familien` return 200. The preview uses the live DB, where the RPC migration is **not** applied,
so the Dorf page shows its error message («Dieses Dorf können wir dir nicht zeigen» / load error) until the migration is applied.

## Open items (need Panat's OK)
1. Apply migration `20261121100000_family_child_village.sql` to the live Supabase DB.
2. Merge `parent-village` into main and deploy to production.
