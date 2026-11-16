# WendApply B2B: app UI (teachers, school admins, students)

Part `b2b-app`. Data layer: `docs/b2b/DATA-MODEL.md` (part `b2b-db`, migrations `supabase/migrations/20261116*_b2b_*.sql`).
No payment code anywhere: package changes go through the contact page.

## Where things are

| Feature | Route / place | Code |
|---|---|---|
| Class overview (statistics, "Wer braucht Unterstützung", progress per person) | `/teacher/classes/[id]`, tab **Überblick** | `components/b2b/class-overview.tsx` |
| Class goals (create, edit, delete, progress, class village) | `/teacher/classes/[id]`, tab **Ziele** | `components/b2b/class-goals.tsx`, `class-village.tsx` |
| Class goals for students (aggregates only) | `/classes` (student class area) | `components/b2b/student-goals.tsx`, mounted in `components/teacher/student-class-extras.tsx` |
| School administration (read-only) | `/schul-admin` | `app/schul-admin/*`, `components/b2b/school-admin.tsx` |
| Entry link to `/schul-admin` (only for school admins) | top of `/teacher` and `/settings` | `components/b2b/school-admin-link.tsx` |
| "Meine Daten": JSON export, links to deletion and Löschkonzept | `/settings` | `app/settings/page.tsx` |
| Pure logic (unit-tested) | | `components/b2b/logic.ts` |
| Supabase wrappers with graceful degradation | | `lib/b2b/client.ts` |

The students tab stays the default tab of a class, so existing flows and links are unchanged. New tabs can be opened
directly with `?tab=overview` or `?tab=goals`.

## Data used (all through RLS / security-definer RPCs)

* `class_overview_stats(p_class_id, p_inactive_days)`: per student only counts, `status_counts` (when "Status zeigen"),
  last activity, `placed`, `needs_support` + `reasons`. The client keeps a whitelist of fields (`overviewStudentFromRow`),
  so even an accidental extra column (company, notes) is never rendered. Sent applications = total minus `saved`/`preparing`.
* `class_goal_progress(p_class_id)`: goals with `students_reached` / `students_counted` / `total_value` / `suppressed`.
  **`target` is per person**: the bar shows how many of the counted (sharing) students reached it; the caption adds the
  class total. Custom goals have no target and no automatic progress. Students see `null` + `suppressed` below 3 contributors.
* `class_goals` table: insert/update/delete by the class teachers (RLS). `created_by` is sent as the own user id.
* `school_admin_my_schools()` + `school_admin_overview(p_school_id)`: licence (`students_used`, `student_limit`, `state`,
  `pilot_end`, `days_left`), classes (teacher name, counts, suppressed aggregates), teachers.
* `export_my_data()`: merged into the settings export under `account`. The file keeps `applications`/`profile`/`cvs` in the
  import format, so "Sicherung einlesen" still works. Keys that look like secrets (`token`, `password`, `api_key` …) are removed.

## Graceful degradation (live DB without the B2B migrations)

`isMissingFeature(error)` treats PostgREST `PGRST202/PGRST205`, Postgres `42P01/42883/42703` and 404 as "not deployed".

* Overview tab: falls back to the existing `teacher_class_students` + `teacher_attention` RPCs (same non-confidential view,
  reasons `no_application`, `no_activity`, `self_report`).
* Goals tab: shows "Klassenziele kommen bald", no create button. Student goals: hidden.
* `/schul-admin`: "Schulverwaltung wird eingerichtet" with a contact link. Admin links: hidden.
* Settings export: works without `export_my_data` (no `account` block).

## Privacy and gamification principles in the UI

* Teachers see numbers and steps, never companies, positions, notes or documents (note under "Fortschritt pro Person").
* Hidden (non-sharing) students appear in "Wer braucht Unterstützung" only through their own voluntary self report.
* Progress is the furthest meaningful step (Bewerbung verschickt → Gespräch/Schnuppern → Zusage → Lehrstelle), not the volume.
  Class statistics count students who reached a step, and the teacher sort "Meiste Bewerbungen" became "Am weitesten gekommen".
* Class goals are shared goals ("Klassendorf": one house per goal, it grows with the class progress). No rankings.
* School admins see aggregates per class only; below 3 sharing students the numbers stay hidden (server-side).

## Tests

* `tests/b2b-app.test.mjs` (in `npm test`): feature detection, licence usage (warning at 90 %), pilot days, goal validation
  and status, overview mapping whitelist, fallback, support ordering, progress sort, export scrubbing, source contracts
  (no Eszett, no payment code).
* `scripts/b2b-app-e2e.mjs`: headless Chrome against an in-memory Supabase stand-in, 375 px light and 1280 px dark:
  teacher (overview + goals CRUD incl. custom goal), student (aggregates, suppression), school admin (warning, pilot,
  suppressed class), not-deployed fallbacks, settings export (with and without `export_my_data`).
  `PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3291 node scripts/b2b-app-e2e.mjs`
  (dev server with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy`).
