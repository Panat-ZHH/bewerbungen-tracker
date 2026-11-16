# Report: b2b-db (data layer)

Branch `b2b-db` from `feature/pwa` (8c02add). Not pushed, not applied to any live database.

## Built
* `supabase/migrations/20261116100000_b2b_schools_licences.sql`: `schools`, `school_licences` (manual, no billing,
  package defaults, 30-day pilot end), `school_admins`, role `school_admin`, `classes.school_id`, seat counting
  (`school_student_count`) and enforcement triggers on `class_members` and `classes` (errors WA001/WA002/WA003 with German
  details), school admin RPCs (`school_admin_my_schools`, `school_admin_overview`, `school_attach_class`,
  `school_detach_class`), teacher `class_school_info`, service-role `platform_*` helpers, `set_my_role` hardening.
* `…110000_b2b_class_goals_stats.sql`: `class_goals` (teachers CRUD directly through RLS, members read),
  `class_goal_progress` (aggregates only, suppressed below 3 contributors for students), `class_overview_stats`
  (per-student counts + needs_support reasons, consent-aware, plus class totals).
* `…120000_b2b_data_rights.sql`: `export_my_data()` (all own rows via FK discovery, credentials redacted).
  Erasure already existed (`app/api/account/delete`), documented instead of duplicated.
* `…130000_b2b_rls_audit.sql`: audit fixes (category behind "Firmen zeigen", anon revokes, trigger function revokes).
* `lib/b2b/types.ts`, `lib/b2b/licence.ts`: RPC types; packages/prices (CHF 990 / 1'490 / 3'990), `priceQuote`,
  `recommendPackage`, `licenceState`, `licenceError`, `isMissingB2bSchema`, `formatChf`.
* `docs/b2b/DATA-MODEL.md`: contract, deviations, error codes, licence SQL snippets, extension point for family plans,
  privacy rules, data rights, retention concept, RLS audit.

## Tests
* `tests/b2b-db.test.mjs` (19 tests, PGlite, every migration in order): seat limit + German error, re-join, second class,
  invitations, attach over limit, archive/unarchive, pilot expiry, missing licence, student isolation (applications, cvs,
  ai_reviews, roles, schools), teacher stats without confidential fields, hidden students, school admin aggregates and
  suppression, no direct table access for admins, goals RLS + progress, export, account deletion, idempotency, and a
  privilege audit with Supabase default grants simulated.
* `tests/b2b-db-licence.test.mjs` (9 tests): pure helpers, SQL/TS limits in sync, no prices in SQL.
* Full suite, lint (0 errors; the 9 warnings are pre-existing), `tsc --noEmit`: see the commit message.

## Open questions
1. Monthly surcharge: the plan says "mit Aufpreis" without an amount; `MONTHLY_SURCHARGE = 0.1` is an assumption.
2. Pilot seat limit 60 (1-2 classes) is an assumption; change in both `_licence_default_limit` and `SCHOOL_PACKAGES`.
3. Should a school without any licence row block joins (current: yes, WA003) or behave like a private class?
4. Retention proposals (24-month inactivity deletion etc.) need a decision and a scheduled job before they are promised.
5. `social_send_request` reveals whether an e-mail has an account (left unchanged, see DATA-MODEL.md).
