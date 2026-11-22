# Parent village = the child's own village, full details: LIVE (2026-11-22)

**Status: LIVE on https://wendapply.ch.** Gate: `PARENT-VILLAGE-FULL-DETAILS-BUILD.md` → BUILD: PASS, `PARENT-VILLAGE-FULL-DETAILS-QA.md` → **QA: PASS**.
(This replaces the report for 20261122100000 «parent = friend village». Panat said that was wrong: parents must see what the child sees.)

| | |
|---|---|
| New production deploy | `6b033f0a841fbe68a5e96fca` (commit `727052a`, ready + published 2026-11-22) |
| Rollback deploy | `6b030bbfddd45858a662b327` (commit `50947b5`): `netlify api restoreSiteDeploy --data '{"site_id":"b96bc70c-8324-4bb9-a4ef-70877581f8bd","deploy_id":"6b030bbfddd45858a662b327"}'` |
| DB migration | `supabase/migrations/20261122190000_family_child_village_full_details.sql`, applied to bhwreehwirrloxagyypi (PRIVAT) via `sb privat db query --linked -f …` and recorded in `supabase_migrations.schema_migrations` (`20261122190000`, `family_child_village_full_details`) |
| DB rollback | `supabase/rollback/20261122190000_family_child_village_full_details.down.sql`, or the exact pre-migration live dump `_onboarding/parent-village-full-details/db-backup/_acc_impl_family_child_village.before-20261122190000.sql` (verified identical to the live definition before applying). The wrapper `family_child_village` is unchanged; its dump is at `…/db-backup/family_child_village.before-20261122190000.sql`. |

Rollback = both steps together: restore the deploy above **and** run the `.down.sql` (`sb privat db query --linked -f supabase/rollback/20261122190000_family_child_village_full_details.down.sql`), then delete the `20261122190000` row from `supabase_migrations.schema_migrations`.

## What changed

- **DB:** `_acc_impl_family_child_village` now returns, per house, exactly the fields the child's own village shows: real id, company, position (Stelle), location, the real status (incl. Zusage/Absage), createdAt, updatedAt, appliedAt and deadline. It also returns real layouts (`house:<id>`) and items. There is no more pseudo-id or result masking, and `share_settings.applications` no longer affects this view. The privacy gate is unchanged: an active parent of the same family, an active child, consent, and `share_settings.village`. The view never returns notes, salary, job URL, source, job description, contacts, documents, wallet, classes or other families. The wrapper, paywall guard and grants are unchanged.
- **Client:** `components/applications/village-map.tsx` and `lib/family-village.ts` / `lib/read-only-village.ts`. The parent opens houses read-only in the same house sheet as the child, with no edit, move, shop or coins.
- **Copy:** the share toggles (`lib/family-core.ts`), the Datenschutzerklärung, Datenschutz für Jugendliche, the families page and Hilfe describe the new scope. `LEGAL_STAND` is now 22 November 2026.

## Test evidence

Release worktree `pv-fulldetails-rel` (branch `rel/parent-village-full-details`, a fast-forward of origin/main `50947b5` → `9967fd6` + backup commit `727052a`):
- `npm ci` OK.
- `npm run lint`: 0 errors (16 old warnings).
- `npx tsc --noEmit` PASS.
- `npm test`: 1273 tests, 1261 pass, 0 fail, 12 skipped.
- `npm run build` PASS. The first attempt failed only because the fresh worktree had no `.env.local`; it passed after copying it in.

QA (`PARENT-VILLAGE-FULL-DETAILS-QA.md`) included its own leak tests (`tests/qa-parent-village-full-details-db.test.mjs`), a mocked E2E with side-by-side child/parent images, and a copy review.

DB checks after applying:
- The new definition is active: it has `position`, no `_soc_friend_status` masking, and no `show_companies`.
- Grants: `authenticated` cannot execute the impl, `anon` cannot execute the impl or the wrapper, and `authenticated` can execute the wrapper.

## Live checks (no real logins)

- `/`, `/login`, `/familie`, `/familien` and `/datenschutz` each return 200.
- `/familie/kind/<random uuid>/dorf` returns 200 (app shell with a client-side redirect to login). No 500.
- `/datenschutz` HTML contains the new wording «genau so wie du, … nur zum Anschauen».
- The deployed chunk `/_next/static/chunks/42kc9hevpjq7u.js` contains the new toggle text «… stehen Firma, Stelle und Status trotzdem an den Häusern».
- An anonymous REST call `rpc/family_child_village` with the anon key returns HTTP 401 `42501 permission denied` and no data. `rpc/_acc_impl_family_child_village` returns the same.

No rollback was needed.

## Datenschutz change for Panat to review

**Privacy-relevant default (from QA):** `share_settings.village` is **on by default**. Since this release, parents of every child who never touched the toggles see company names, job titles and real outcomes (Absage). Before, they saw neither. Consider a short notice to children on /familie.

**Datenschutzerklärung (`docs/legal/datenschutzerklaerung.md`, Eltern):**
- Old: «Teilst du dein **Dorf**, sieht das Elternteil dein echtes Dorf (Inseln, Häuser, Deko) **nur zum Anschauen**. Firmennamen an den Häusern sieht es nur, wenn du auch die **Bewerbungsliste** teilst.»
- New: «Teilst du dein **Dorf**, sieht das Elternteil dein echtes Dorf (Inseln, Häuser, Deko) genau so wie du, **nur zum Anschauen**: pro Bewerbung **Firma, Stelle, Status** (auch Zusage oder Absage), Ort und Daten (erfasst, zuletzt geändert, abgeschickt, Bewerbungsfrist). Ändern, verschieben oder kaufen kann es nichts.»

**Datenschutz für Jugendliche (`docs/legal/datenschutz-jugend.md`):**
- Old: «Teilst du dein **Dorf**, sehen sie dein echtes Dorf mit Inseln, Häusern und Deko, **nur zum Anschauen**. Firmennamen an den Häusern sehen sie nur, wenn du auch deine **Bewerbungsliste** teilst.»
- New: «Teilst du dein **Dorf**, sehen sie dein echtes Dorf genau so wie du, **nur zum Anschauen**: Inseln, Häuser und Deko, an jedem Haus **Firma, Stelle und Status** (auch Zusage oder Absage) und beim Antippen die Daten (Ort, erfasst, geändert, abgeschickt, Frist). Ändern können sie nichts.»

**Share toggles (`lib/family-core.ts`):**
- «Dorf teilen», on. Old: «Deine Eltern sehen dein echtes Dorf mit Inseln, Häusern und Deko, nur zum Anschauen. Firmennamen an den Häusern sehen sie nur, wenn du auch die Bewerbungsliste teilst. …» New: «Deine Eltern sehen dein echtes Dorf genau so wie du: Inseln, Häuser und Deko, an jedem Haus Firma, Stelle und Status (auch Zusage oder Absage) und beim Antippen die Daten. Nur zum Anschauen, sie können nichts verändern. …»
- «Bewerbungsliste teilen», off. Old: «Firmen und Stellen bleiben privat.» New: «Die Liste bleibt privat. Teilst du dein Dorf, stehen Firma, Stelle und Status trotzdem an den Häusern.»

Unchanged in all texts: notes, salary, contacts, links and documents are never shown; sharing can be switched off at any time; under 16, a parent must consent first.

Cosmetic nit from QA (not fixed): the texts say Firma, Stelle and Status are «an jedem Haus». The house label shows company and status; the Stelle appears in the house sheet.
