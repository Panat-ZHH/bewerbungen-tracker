# Report: B2B merge, test, review (branch `b2b-integration` → `feature/pwa`)

Date 2026-11-16. Not pushed, nothing merged into `main`, nothing applied to the live Supabase DB, no production deploy, no payment code.

## Merged
`feature/pwa` (8c02add) + `b2b-db` (eba9fcc) + `b2b-app` (a2586d3) + `b2b-site` (0d4b37f): no conflicts. The app's RPC names,
parameters (`p_…`) and JSON keys were checked against the migrations and `DATA-MODEL.md`: they match.

## Integration fixes (c23676a, 50a20ed)
* One price source: `PACKAGE_INFO` (school admin) and `PACKAGES`/`PILOT` (public site) now derive limits/prices from
  `SCHOOL_PACKAGES` in `lib/b2b/licence.ts` (Swiss number format in the admin view).
* Student join flow: licence errors WA001–WA003 are shown with their German text. Before, `LICENCE_EXPIRED` matched the
  generic `EXPIRED` code and was shown as "Diese Einladung ist abgelaufen". `databaseError` now keeps `error.details`.
* `/schul-admin`: "Klasse hinzufügen" by class code (`school_attach_class`) and "Lösen" (`school_detach_class`); before,
  the RPCs existed but school admins had no way to attach a class. Licence-full message tailored to the admin.
* `school_licences.notes` (internal) no longer readable by school admins (column-level grant, test added).

## Independent review (agent 971d6cab, `docs/b2b/REVIEW.md`)
Fixed by the reviewer with regression tests: 9de67d6 (school admin totals could be differenced to reveal one student),
6e9d01a (teachers got status-derived data without "Status zeigen"). Open/debatable points: see REVIEW.md (#3 attach by
join code without teacher consent, #4 k=3 includes the viewing student, #5 `applications_sent` goals reward counts,
#10 "Schüler:innen" vs "Schülerinnen und Schüler", #12 5 MB screenshots in `docs/b2b/shots/` in a public repo).

## Tests (final state)
* `npx tsc --noEmit` ok · `npm run lint` 0 errors (9 old warnings) · `npm test` 509/509 (incl. PGlite `b2b-db` 21/21).
* `npm run build` ok. `scripts/b2b-app-e2e.mjs` 108/108 (teacher, student, school admin incl. attach + licence-full,
  not-deployed fallbacks, settings export; 375 px light + 1280 px dark).
* `scripts/pwa-qa.mjs` 22/22 (manifest, SW registration, offline page, no Supabase/API in caches).
* `tests/b2b-site-shots.mjs`: 6 public pages × 375/1366 × light/dark: no overflow, 0 axe violations, no JS errors.
* `scripts/e2e-all.mjs`: 776 pass / 40 fail. The same 40 (plus one map flake) fail on untouched `feature/pwa` (775/41):
  stale selectors in older flows (application form select, CV list, classes-teacher, teacher invite label). No regression.

## Preview
https://b2b-preview--bewerbungen-pawat.netlify.app (`netlify deploy --build --alias b2b-preview`, not production).
It uses the LIVE Supabase, where the B2B migrations are not applied: the live API answers PGRST202/PGRST205 for the new
RPCs/table, which the UI treats as "not deployed" (goals tab "kommen bald", overview falls back to existing teacher RPCs,
`/schul-admin` "wird eingerichtet", admin links hidden, export without the server part). All public pages return 200.

## Needs Panat's decision
Apply the 4 migrations `supabase/migrations/20261116*_b2b_*.sql` to the live DB; merge into `main` + production deploy;
pilot free?; monthly surcharge (10 % assumed); pilot seat limit (60 assumed); sales contact address (now info.wendico@gmail.com);
VAT wording; legal review of AVV/DSFA/privacy texts; REVIEW.md open points #3–#5.
