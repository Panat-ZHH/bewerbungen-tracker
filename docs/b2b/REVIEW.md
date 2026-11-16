# Independent review: WendApply B2B integration (branch `b2b-integration`)

Date: 2026-11-16 · Scope: `git diff feature/pwa...b2b-integration` (B2B migrations `20261116*_b2b_*.sql`, `lib/b2b/*`,
`components/b2b/*`, `components/public/*`, new public pages, `/schul-admin`, `/settings`) · Reviewer: independent agent.

## Result

Two real privacy leaks were found in the SQL. Both are now **fixed with regression tests**, each in its own commit:

| Commit | Fix |
| --- | --- |
| `9de67d6` | School admin totals could be differenced against the visible classes to reveal one student's numbers (complementary suppression added). |
| `6e9d01a` | Teachers got status-derived data without "Status zeigen" (`upcoming_deadline` reason, `applications_sent` goal metric). |

Everything else is listed below as debatable / product decisions. Nothing was pushed, merged, deployed or applied to a live DB.

## Findings (by severity)

### HIGH (fixed) 1. School admin: differencing leak in `school_admin_overview`
`supabase/migrations/20261116100000_b2b_schools_licences.sql` (totals block, `tot` CTE).
Per-class aggregates were suppressed below 3 sharing students, but the **school totals** were only checked against the
whole school. Example: class V with 3 sharing students (visible: 3 applications), class W with 1 sharing student
(suppressed). Totals showed 7 applications, so 7 − 3 = 4 is exactly the one W student's count (same for placed,
with application, active in 14 days). **Fix:** totals are also suppressed while the residual group (sharing students who are
in no visible class) has 1 or 2 students. Test: `tests/b2b-db.test.mjs` "school admin: totals cannot be differenced …".
The admin UI only shows per-class numbers and `totals.students`, so no UI change was needed.

### MEDIUM (fixed) 2. Teachers: status-derived data with only "Fortschritt teilen"
`supabase/migrations/20261116110000_b2b_class_goals_stats.sql` (`_goal_metric_value`, `class_overview_stats`).
The file's own rule (and `teacher_attention`, and the consent text "Mit «Status zeigen»: den Stand jeder Bewerbung")
says anything derived from the status needs `share_status`. But `upcoming_deadline` was computed from applications in
`saved`/`preparing`, and `applications_sent` counted by status, with only `share_applications`. **Fix:** `upcoming_deadline`
needs `share_status`; `applications_sent` without `share_status` counts only `applied_at` (which "Fortschritt teilen" covers).
Test: "teacher: nothing derived from the application status without 'Status zeigen' …". `DATA-MODEL.md` updated.

### MEDIUM (open, debatable) 3. A school admin can attach any class just by knowing its join code
`20261116100000_b2b_schools_licences.sql:344` `school_attach_class`. Join codes are handed to students, so they leak easily.
Attaching needs no teacher consent and immediately gives the admin the class name, teacher name, student counts and
(≥ 3) aggregates, and puts the class's seats under that school's licence. Suggest: the teacher confirms (or a separate
one-time "school code" instead of the student join code), and/or the class teacher gets a notification.

### MEDIUM (open, debatable) 4. Student goal view: k = 3 includes the student themself
`20261116110000_b2b_class_goals_stats.sql:105-108`. A member sees `total_value` when 3 students contribute, but knows their
own value, so they learn the exact sum of the 2 others; with several goals on the same metric and different targets
(`students_reached`) even more. Consider requiring ≥ 4 contributors for members (or ≥ 3 *other* students), and live numbers
allow before/after differencing anyway (see 7).

### MEDIUM (open, product) 5. `applications_sent` goals reward application count
`components/b2b/logic.ts:71`. Business rule: gamification rewards meaningful progress, not the number of applications.
A class goal "each of you sends N applications" is exactly a count target. The hint text ("Sorgfältig vorbereitete …")
softens it; consider leading with `trial_days`/`interviews`/custom goals in the UI or capping/de-emphasising this metric.

### LOW 6. `students_placed` for school admins
`20261116100000_b2b_schools_licences.sql:333`. Suppression is based on `share_applications` count, but placed needs
`share_status`; with 3 sharing students and 1 sharing status, "1 placed" pins that status to a small group. No names are
shown, so risk is low; could suppress placed separately when fewer than 3 students share status.

### LOW 7. Temporal differencing
All aggregates are live; watching a number change after one student's action reveals that action. Inherent to live
aggregates; acceptable for counts, worth a sentence in the DPIA / AVV.

### LOW 8. `school_licences.notes` readable by school admins
`20261116100000_b2b_schools_licences.sql:82`. The RLS policy exposes the whole row, including internal `notes`
(e.g. sales notes, discounts). Use a view/RPC without `notes`, or document that notes are customer-visible.

### LOW 9. Licence error copy shown to the school admin
`20261116100000_b2b_schools_licences.sql:183`: "Die Schulleitung kann die Lizenz erweitern." is also shown in
`/schul-admin` when attaching a class fails (screenshot `app/mobile-light-school-admin.png`), i.e. to the school
leadership itself. Suggest the UI maps WA001 for admins to "Für mehr Plätze meldet euch über Kontakt".

### LOW 10. Copy consistency
The admin/teacher UI uses "Schüler:innen", the public site "Schülerinnen und Schüler". Pick one.

### INFO 11. Assumptions to confirm before quoting
`lib/b2b/licence.ts:41` monthly surcharge +10 % is an assumption (business plan: "mit Aufpreis", amount open).
`components/public/marketing.ts:42` pilot is advertised as free (open question already in REPORT-b2b-site.md).
Pilot seat limit 60 for "1–2 Klassen" is reasonable.

### INFO 12. 5.3 MB of PNG screenshots committed in `docs/b2b/shots/`
The GitHub repo is public; consider removing them from the branch before it is pushed (they contain only demo data).

## What was verified

* **RLS / privacy (SQL read line by line + PGlite):** `node --experimental-strip-types --test tests/b2b-db.test.mjs` →
  21/21 pass (19 existing + 2 new). Students cannot read other students' rows, schools or licences; school admins only see
  their school, licence and admin rows, no `classes`/`class_members`/`applications`, no names of students; teachers'
  `class_overview_stats` never returns company, position, location, notes; hidden students only show the voluntary
  `self_report`; `class_student_applications` now hides category without `share_companies`; `export_my_data` returns only
  own rows with tokens/push keys redacted; anon can execute no SECURITY DEFINER RPC; every SECURITY DEFINER function has
  `search_path = ''`; internal/trigger/platform functions are not executable by users; seat limit, pilot expiry and
  licence-missing errors (WA001–WA003) work; account deletion cascades.
* **No payment code:** grep for stripe/checkout/payrexx/paypal/twint/datatrans/payment_intent in `app components lib
  supabase scripts package.json` → nothing (only a `dataTransfer` false positive and the e2e check that asserts no payment UI).
  Prices exist only in `lib/b2b/licence.ts` (990 / 1'490 / 3'990, limits 100 / 300 / 800, custom = individual offer) and
  match the business facts; `marketing.ts` derives from it.
* **Swiss spelling:** no U+00DF in UI copy in `app/ components/ lib/` and none in the B2B migrations; the only hits are two
  search-normalisation functions (`lib/job-results.ts:46`, `lib/job-filters/query.ts:5`) that convert it to "ss", which is
  correct. Rendered text of all new public pages checked in the browser: no sharp s.
* **Links:** crawled `/ /schulen /preise /pilot /datenschutz-uebersicht /hilfe /anleitung /kontakt /impressum /datenschutz`
  on the production build (port 3291): 53 distinct internal links, all 2xx, and every `#anchor` exists on its target page.
* **Mobile 375 px, light + dark, axe (wcag2a/aa):** all six new/changed public pages: no horizontal page overflow (the
  table on /datenschutz-uebersicht scrolls inside its own container), dark mode applies, 0 axe violations.
* **Logged-in pages:** `scripts/b2b-app-e2e.mjs` against the build with the mocked Supabase → 108/108 checks, 0 page problems.
* After the fixes: `npx tsc --noEmit` ok, `npm run lint` 0 errors (9 pre-existing warnings), `npm test` 509/509 pass.

## Screenshots (not committed, in `/tmp/b2b-review-shots/`)

Public, 375 px: `landing|schulen|preise|pilot|datenschutz-uebersicht|hilfe` × `-375-light.png` / `-375-dark.png` (12 files).
App (`/tmp/b2b-review-shots/app/`): `mobile-light-` and `desktop-dark-` × `school-admin`, `student-goals`, `teacher-goals`,
`teacher-overview`; `not-deployed-school-admin.png`; `settings-my-data.png`.
