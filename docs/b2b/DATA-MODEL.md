# WendApply B2B data model (branch `b2b-db`)

Migrations: `supabase/migrations/20261116100000_b2b_schools_licences.sql`, `…110000_b2b_class_goals_stats.sql`,
`…120000_b2b_data_rights.sql`, `…130000_b2b_rls_audit.sql`. Pure helpers and types: `lib/b2b/licence.ts`, `lib/b2b/types.ts`.
Tests: `tests/b2b-db.test.mjs` (PGlite, all migrations in order, role-based), `tests/b2b-db-licence.test.mjs`.

**Nothing here is applied to the live database.** All four files are additive and idempotent; apply them in order after
the existing migrations. No payment code exists; licences are assigned by hand.

## Deviations from the agreed contract (read first)

| Contract | Built | Why |
|---|---|---|
| `schools.canton_or_state text` | `not null default ''` | No null checks in the UI. |
| `school_licences.student_limit int` | `not null`; filled from the package by a trigger when omitted (pilot 60, starter 100, professional 300, enterprise 800); `custom` must give it (`LICENCE_LIMIT_REQUIRED`) | One source of truth for the seat check. |
| `status` | default `'active'`; a `pilot` package inserted with the default becomes `status = 'pilot'`; `pilot_start` defaults to today for pilots | Fewer manual mistakes. |
| `class_goals.target int` | nullable, but required unless `metric = 'custom'`; `created_by` defaults to `auth.uid()` and is `on delete set null` | Custom goals have no number; goals stay when a co-teacher deletes their account. |
| `class_overview_stats(class_id)` | `class_overview_stats(p_class_id uuid, p_inactive_days int default 14) returns jsonb` | Same threshold parameter as `teacher_attention`. |
| reason codes | `no_activity`, `no_application`, `many_rejections`, `upcoming_deadline` **plus** `self_report` | `self_report` is the existing voluntary "noch keine Lehrstelle" flag. |
| `delete_my_data()` | **not added** | Account deletion already exists (see "Data subject rights"). |
| (new) | `school_admin_my_schools`, `school_admin_overview`, `school_attach_class`, `school_detach_class`, `class_school_info`, `is_school_admin`, `is_class_teacher`, `is_class_member`, `platform_*` | The admin and teacher UI need them. |

RPC parameter names always start with `p_` (as in the existing RPCs): `rpc("class_overview_stats", { p_class_id })`.

## Tables

| Table | Columns | Who can read directly (RLS) | Who writes |
|---|---|---|---|
| `schools` | id, name, canton_or_state, country (`CH`/`DE`/`AT`), created_at | its school admins | service role (`platform_create_school`) |
| `school_licences` | id, school_id, package, student_limit, status, pilot_start, pilot_end, valid_from, valid_until, billing_interval (`yearly`/`monthly`), notes, created_at | its school admins | service role (`platform_assign_licence`) |
| `school_admins` | school_id, user_id, created_at | admins of the same school | service role (`platform_add_school_admin`) |
| `classes.school_id` | nullable FK → schools (`on delete set null`) | unchanged (teacher owns the class) | `school_attach_class` / `school_detach_class` (school admin), service role |
| `class_goals` | id, class_id, title, description, metric (`applications_sent`/`interviews`/`trial_days`/`custom`), target (per student), due_date, created_by, created_at | teachers and members of the class | **teachers of the class, directly** with `supabase.from("class_goals").insert/update/delete` (RLS checks the class; `created_by`, `class_id` and `created_at` cannot be changed) |

`user_roles.role` now allows `student | teacher | school_admin`. `school_admin` is only a label for people who are *only*
admins (so the app can show the admin area); it cannot be chosen with `set_my_role`, and a school admin cannot switch
away from it. **Authorisation is always the `school_admins` table**, so a teacher can also be a school admin.

## Licences and seats

* Effective state: `public._licence_state(status, pilot_end, valid_from, valid_until)` → `pilot | active | not_started |
  expired | cancelled` (TS mirror: `licenceState()`). `pilot` past `pilot_end` and `active` past `valid_until` are `expired`.
* Governing licence: newest usable row of the school, else the newest row.
* Seats used: `school_student_count(p_school_id)` = distinct students in the school's **non-archived** classes
  (a student in two classes counts once; archiving a class frees its seats). Callable by school admins, teachers of a class
  of that school and the service role.
* Enforcement (triggers, so every join path is covered: `class_join`, `class_invite_accept`, direct inserts):
  * `class_members` BEFORE INSERT: only when the class has a `school_id` and is not archived; re-joins need no seat.
  * `classes` BEFORE INSERT/UPDATE OF `school_id`, `archived`: attaching a class or un-archiving it brings all its members.
  * The school row is locked (`for update`), so two simultaneous joins cannot take the last seat twice.
* Classes **without** `school_id` (every existing class) behave exactly as before.

### Error contract (supabase-js `error.code` / `error.message` / `error.details`)

| `code` (SQLSTATE) | `message` | `details` (German, Swiss spelling) |
|---|---|---|
| `WA001` | `LICENCE_LIMIT_REACHED` | "Die Schullizenz ist voll (x von y Plätzen belegt). Die Schulleitung kann die Lizenz erweitern." |
| `WA002` | `LICENCE_EXPIRED` | "Die Pilotphase dieser Schule ist abgelaufen. …" / "Die Lizenz dieser Schule ist nicht aktiv. …" |
| `WA003` | `LICENCE_MISSING` | "Für diese Schule ist noch keine Lizenz hinterlegt. …" |

Use `licenceError(error)` from `lib/b2b/licence.ts`: returns `{ code, message }` (German) or `null`.
Other new error messages: `FORBIDDEN`, `NOT_FOUND`, `CLASS_NOT_FOUND`, `CLASS_IN_OTHER_SCHOOL`, `LICENCE_LIMIT_REQUIRED`, `AUTH_REQUIRED`.

### Assigning a licence (manual, service role / Supabase SQL editor)

```sql
select public.platform_create_school('Sekundarschule Uster', 'ZH', 'CH');                 -- returns school id
select public.platform_assign_licence('<school id>', 'pilot');                             -- 30-day pilot from today, 60 seats
select public.platform_assign_licence('<school id>', 'professional', 'active', null, '2027-08-01');  -- 1 year, 300 seats
select public.platform_assign_licence('<school id>', 'custom', 'active', 1200, '2027-08-01', '2028-07-31', 'monthly', 'Verband X');
select public.platform_add_school_admin('<school id>', 'schulleitung@example.ch', true);  -- true = give the school_admin role label
update public.school_licences set status = 'cancelled' where id = '<licence id>';           -- end a licence
```
The school admin then attaches classes with the class join code (`school_attach_class`). Prices are not in the database:
`SCHOOL_PACKAGES` / `priceQuote()` in `lib/b2b/licence.ts` (CHF 990 / 1'490 / 3'990 per year; monthly payment = yearly
price + `MONTHLY_SURCHARGE`, **10 % is an assumption**, the business plan only says "mit Aufpreis").

### Extension point: other plan holders (family / private plans)

The family-accounts agent should **not** add columns to `school_licences`. Instead:
1. Create its own table (e.g. `family_plans`: id, holder user_id, package, status, pilot/valid dates, billing_interval,
   notes) with the **same column names and status values**.
2. Reuse `public._licence_state(status, pilot_end, valid_from, valid_until)` for the effective state (immutable, no access check).
3. In TS, reuse `LicenceState`, `licenceState()`, `BillingInterval`, `PlanDefinition` and add a second catalogue
   (`PlanHolder = "family" | "private"`) next to `SCHOOL_PACKAGES`.
4. `export_my_data()` picks up the new table automatically if it has a foreign key to `auth.users`.

## RPCs

| RPC | Caller | Returns |
|---|---|---|
| `school_admin_my_schools()` | any signed-in user (empty if not an admin) | rows `{school_id, name, canton_or_state, country, licence}` |
| `school_admin_overview(p_school_id)` | admin of that school | `SchoolAdminOverview` JSON: school, licence summary (+ seats used/left, days_left), totals, per class, teachers |
| `school_attach_class(p_school_id, p_join_code)` | admin | `{class_id, name, students}`; raises WA001–WA003 |
| `school_detach_class(p_school_id, p_class_id)` | admin | void |
| `school_student_count(p_school_id)` | admin, teacher of a school class, service role | integer |
| `class_school_info(p_class_id)` | teacher of the class | `{school, licence}` (both null for a private class) |
| `class_goal_progress(p_class_id)` | teachers and members of the class | one row per goal: totals only (`students_total`, `students_counted`, `students_reached`, `total_value`, `average_value`, `suppressed`) |
| `class_overview_stats(p_class_id, p_inactive_days default 14)` | teachers of the class | `ClassOverviewStats` JSON (see `lib/b2b/types.ts`) |
| `export_my_data()` | any signed-in user | `MyDataExport` JSON |
| `is_school_admin(p_school_id)`, `is_class_teacher(p_class_id)`, `is_class_member(p_class_id)` | any signed-in user (about themself) | boolean |
| `platform_create_school`, `platform_assign_licence`, `platform_add_school_admin` | **service role only** | ids |

### What each role sees

* **Students**: their own rows only (unchanged). Class goals of their classes and *aggregate* goal progress; numbers are
  `null` with `suppressed = true` while fewer than 3 students contribute, so a classmate cannot be singled out.
* **Teachers** (`class_overview_stats`): per student only counts — applications, applications per status, last activity,
  placed, needs_support + reasons. Never company, position, location, notes, salary, contacts, documents or links.
  Consent switches are respected exactly like the existing teacher RPCs: without "Fortschritt teilen" a student is
  `hidden` (only name + the voluntary `self_report` reason); status-based numbers (`status_counts`, `placed`,
  `many_rejections`) need "Status zeigen". Placed students never need support (same rule as `teacher_attention`).
  Goal progress: totals without suppression (teachers can already see each consenting student).
* **School admins**: their school, licence and seat usage, list of classes (name, year, teacher name, student count) and
  teachers (name, number of classes), plus aggregates of **sharing** students only (applications, students with an
  application, placed, active in 14 days), suppressed below 3 sharing students. No student names, no per-student data, no
  application rows, no direct access to `classes`, `class_members` or `applications`.

### Support reasons (`class_overview_stats`)

| Reason | Rule | Needs |
|---|---|---|
| `self_report` | student set "noch keine Lehrstelle" | nothing (voluntary) |
| `no_application` | no application at all | Fortschritt teilen |
| `no_activity` | last activity (`max(applied_at, created_at, updated_at)`) older than `p_inactive_days` | Fortschritt teilen |
| `upcoming_deadline` | an application in `saved`/`preparing` with a deadline within 7 days | Fortschritt teilen |
| `many_rejections` | 3 or more applications with status `rejected` | Status zeigen |

### Goal metrics (per student, compared with `target`)

* `applications_sent`: applications with `applied_at` set or status in applied/aptitude_test/interview/final_interview/offer/contract_signed/rejected (same list as the map reward). Needs "Fortschritt teilen".
* `interviews`: status interview/final_interview/offer/contract_signed. Needs "Status zeigen".
* `trial_days`: applications with a `schnupper_date` in the past (or status `schnupper_done` without a date, if status is shared).
* `custom`: no automatic progress (numbers `null`).
Counts are all-time (not since the goal was created). Students who do not share are not counted (`students_counted`).

## Data subject rights

* **Access / portability**: `export_my_data()` returns every row in `public` that references the caller through a
  foreign key to `auth.users` (discovered from the catalogue, same as `account_data_report`, so new tables are included
  automatically), grouped by table, plus readable context (friend names, classes with teacher and school). Redacted:
  `token` (calendar feeds, class invitations), `p256dh`, `auth` (push keys). Uploaded files stay in Storage; their
  metadata (`cvs.file_name`, `storage_path`) is in the export. The UI should offer it as a JSON download in /settings.
* **Erasure**: already implemented, not duplicated: `POST app/api/account/delete` (service role,
  `lib/account-delete-server.ts`) → `account_delete_prepare(uid)` (hands classes to a co-teacher) → removes Storage files
  (`cvs`, `avatars`) → `auth.admin.deleteUser` (every public FK cascades / nulls, enforced by
  `20261108000000_account_deletion.sql`) → `account_data_report(uid)` proves nothing is left. The new tables are covered:
  `school_admins` cascades, `class_goals.created_by` is set null, goals go with their class; schools and licences stay
  (they hold no personal data). The tests check `account_data_report = {}` after deleting a teacher.
* **Rectification**: users edit their profile/applications directly; names via `profile_set_display_name`.

## Retention concept (documentation only, nothing is deleted automatically)

| Data | Kept | Then |
|---|---|---|
| Student account (profile, applications, documents, AI reviews, map) | while the account exists | deleted immediately and completely on self-service deletion. **Proposal:** remind after 18 months without login, delete after 24 months (needs a job + e-mail, not built). |
| Class membership, consent switches, teacher aliases | while the student is in the class | removed on leaving, removal by the teacher, class deletion or account deletion |
| Archived classes | until the teacher deletes them | **Proposal:** schools delete archived classes 12 months after the end of the school year; the school admin view lists archived classes |
| `class_view_log` (who looked at my data) | while class and accounts exist | **Proposal:** 12 months |
| `class_notifications`, announcements | while the class exists | **Proposal:** 12 months |
| `reminder_log` | technical dedupe | **Proposal:** 90 days |
| `ai_reviews` | until the user deletes them | **Proposal:** 12 months |
| Schools, licences (`school_licences`) | contract records, no personal data | 10 years (Swiss OR Art. 958f / German HGB for invoices once billing exists) |
| School admin link | while the admin account exists | cascades on account deletion |
| Backups | per Supabase plan (point-in-time / daily) | deleted data disappears from backups when they rotate; mention in the privacy policy |

## RLS / privilege audit (2026-11-16)

Checked every table and every SECURITY DEFINER function after all migrations, including a run with Supabase's default
privileges simulated (`alter default privileges … grant all … to anon, authenticated`), see the last tests in `tests/b2b-db.test.mjs`.

Result:
* All public tables have RLS on; anon has no table privilege on any table.
* All SECURITY DEFINER functions set `search_path` (`''` everywhere, `public, pg_temp` for the three `account_*` functions,
  which is safe because nobody but the owner can create objects in `public`).
* anon can execute exactly one SECURITY DEFINER RPC: `invite_context` (intended, login-page banner).
* Internal (`_…`), trigger and `platform_*` functions are not executable by `authenticated`.
* `applications`, `profiles`, `cvs`, `application_documents`, `ai_reviews`, `ai_review_user_settings`, `reminder_settings`,
  `push_subscriptions`, `calendar_feeds`, `map_*`: own rows only. Storage bucket `cvs` is private, owner folder only.
* Friend sharing (`social_friends_overview`, `map_friend_island`) exposes only what the owner switched on: counts and
  map only with `share_with_friends`, company names only with `share_companies_with_friends`, results (offer/rejection)
  masked unless `share_outcomes_with_friends`; never position, location, dates, notes, salary, links, documents.
* Teacher RPCs respect `share_applications` / `share_status` / `share_companies`.

Fixed in `20261116130000_b2b_rls_audit.sql`:
1. `class_student_applications` returned the Berufsfeld (`category`) with only "Fortschritt teilen"; it now needs
   "Firmen zeigen" like company, position and location (matches the consent text). `lib/teacher-more.ts` does not use it;
   the older `lib/classes.ts` passes it through and may now receive `null`.
2. Explicit `revoke … from anon` on `ai_reviews`, `ai_review_user_settings` and the new tables (defense in depth).
3. Trigger functions (`create_default_cvs_for_user`, `map_layouts_lock_streets`, `_soc_after_signup`, the new guards)
   revoked from `public, anon, authenticated`.
4. (in part 1) `set_my_role` refuses to change a `school_admin`.

Known, not changed (UI/product decisions, low risk):
* `social_send_request(email)` answers `USER_NOT_FOUND` for unknown addresses, so a signed-in user can test whether an
  e-mail address has an account. Fix if wanted: always answer "Anfrage gesendet".
* `avatars` bucket is public by design (profile pictures are shown to friends and teachers); URLs contain the user id.
* `social_avatars` lets only the class **owner** (not co-teachers) see student avatars (functional gap, not a leak).

## UI guidance (other agents)

* New UI must work on a database without these migrations: on `isMissingB2bSchema(error)` hide the feature.
* Show `licenceError(error)?.message` when a join fails; otherwise the existing error mapping.
* `class_goals`: read with `supabase.from("class_goals").select().eq("class_id", id)`, progress with
  `rpc("class_goal_progress", { p_class_id })`; never compute per-student goal progress in the client.
