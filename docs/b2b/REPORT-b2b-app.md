# Report: b2b-app (teacher, school admin, student UI)

Branch `b2b-app` (based on `feature/pwa` 8c02add). Not pushed, not deployed, no DB changes. Details: `docs/b2b/APP.md`.

## Built

1. **Teacher class overview** (tab "Überblick"): class statistics as accessible progress bars (students who reached a step,
   not volume), "Wer braucht Unterstützung" with reasons, progress per person (step + sent / interviews / schnuppern,
   last activity, needs-support badge). No application contents.
2. **Class goals** (tab "Ziele"): create, edit, delete with validation; progress bar = students who reached the per-person
   target; class total in the caption; "Klassendorf" (one house per goal, grows with the class progress).
3. **Student view**: "Ziele deiner Klasse" on `/classes`, aggregates only, suppression text below 3 contributors.
4. **School admin** `/schul-admin`: school, package, status, pilot days left, students vs limit (bar, warning from 90 %,
   "full" at 100 %), classes (teacher, suppressed aggregates), teachers, "Paketwechsel über Kontakt". Read-only, no payments.
   Entry link on `/teacher` and `/settings` only for school admins.
5. **Settings "Meine Daten"**: "Daten exportieren (JSON)" (local data in import format + `export_my_data()` when deployed,
   secrets stripped), links to Löschkonzept/Datenschutz; existing "Meine Daten löschen" and "Konto löschen" (with
   confirmation dialogs) reused, not duplicated.
6. **Gamification copy**: teacher sort "Meiste Bewerbungen" → "Am weitesten gekommen" (progress rank); new copy stresses
   steps over counts.

All new UI degrades gracefully when the B2B migrations are not applied (hidden or fallback to existing teacher RPCs).

## Files

New: `components/b2b/{logic.ts,progress-bar.tsx,class-overview.tsx,class-goals.tsx,class-village.tsx,student-goals.tsx,school-admin.tsx,school-admin-link.tsx}`,
`lib/b2b/client.ts`, `app/schul-admin/{layout,page}.tsx`, `tests/b2b-app.test.mjs`, `scripts/b2b-app-e2e.mjs`, `docs/b2b/APP.md`, this report.
Changed: `components/teacher/{class-view.tsx,dashboard.tsx,student-class-extras.tsx,students-panel.tsx,logic.ts}`,
`app/settings/page.tsx`, `scripts/e2e-all.mjs` (one selector: export button renamed to "Daten exportieren (JSON)").

## Tests

* `npx tsc --noEmit`: clean. `npm run lint`: 0 errors (9 pre-existing warnings in files I did not touch).
* `npm test`: 467/467 pass (includes the 15 new tests in `tests/b2b-app.test.mjs`).
* `scripts/b2b-app-e2e.mjs`: 102/102 checks, 0 page errors (375 px light + 1280 px dark).
* `npm run build` (dummy Supabase env): passes, `/schul-admin` is static.
* `scripts/teacher-e2e.mjs` (existing): 24 pass, 4 aborts at `getByLabel("E-Mail-Adressen")`. Pre-existing: that label does not
  exist in the untouched `invite-panel.tsx` on `feature/pwa` either (the script is older than the current invite UI).

## Open questions / notes for merge

* Data contract: aligned to the committed `b2b-db` migrations (eba9fcc). `class_goals.target` is **per person**
  (DATA-MODEL), the UI labels it "Zielwert pro Person".
* `b2b-db` added `lib/b2b/licence.ts` (`SCHOOL_PACKAGES`, `isMissingB2bSchema`, `licenceError`) and `lib/b2b/types.ts`.
  This branch has its own equivalents in `components/b2b/logic.ts` (`PACKAGE_INFO`, `isMissingFeature`) because those
  files are not on this branch; after merging both, `PACKAGE_INFO` could re-export from `SCHOOL_PACKAGES`. No file overlaps.
* `licenceError()` (seat limit on joining a class) is not wired into the student join flow: that page is outside this part.
* A pure `school_admin` user (role label without teacher/student) is routed like a student by `lib/role.ts`
  (`loadMyRole` maps unknown roles to student). `/schul-admin` itself works for any signed-in user and the DB decides.
  Proper routing for `school_admin` needs a change in `lib/role.ts` and the workspace nav (not owned by this part).
* Gamification copy outside this part's files still says "Jede Bewerbung baut ein Haus" / weekly goal counts
  applications: `components/onboarding/student-onboarding.tsx`, `components/guide/content.tsx`, `lib/rewards-core.ts`,
  `components/dashboard/weekly-goal.tsx`, plus "Meiste Bewerbungen" sort in `components/classes/class-detail.tsx`.
