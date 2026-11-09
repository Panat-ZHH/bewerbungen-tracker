# QA P0 – database (live PRIVAT project bhwreehwirrloxagyypi)

Date 2026-11-06 · branch `release-p0` · executed with `scripts/qa-p0-sql.sql` (re-runnable).

**Result: 203 checks, 0 failed** (after one additive fix, see "Gap found and fixed").

## Method
- One SQL script run through `sb privat db query --linked -f`. It inserts 7 throwaway users into `auth.users`, builds data (applications with private notes/contacts, documents, reminders, push subscriptions, ICS feeds, friendships, two classes) and switches into the real roles (`set local role anon|authenticated` with `request.jwt.claims`), so RLS, grants and RPC checks run exactly as PostgREST would.
- Everything runs in **one transaction that always aborts** (the last statement raises `QA_RESULT:{json}`), so nothing is ever committed: no throwaway user, class, application or file exists afterwards (verified: 0 `qa-%@example.invalid` users, 0 `qa-%` applications, 0 `QA Klasse%` classes). Real data was never read into the report or modified.
- Run it again: `~/JARVIS/bin/sb privat db query --linked -f scripts/qa-p0-sql.sql` – the JSON result is in the error text after `QA_RESULT:`.

## Inventory (migrations vs. live)
- All 26 tables created by `supabase/migrations` exist live; **RLS is enabled on all 26**; no policy targets `anon`/`public` (every policy is `to authenticated`).
- Tables with RLS but no policy (deny-all, accessed only through security-definer RPCs): class_announcements, class_deadlines, class_invitations, class_notifications, class_student_aliases, class_teachers, class_view_log, reminder_log.
- All 109 functions created in migrations exist live (diff both ways: the only live-only function is Supabase's own `rls_auto_enable`). All security-definer functions have a fixed `search_path`.
- Anon can execute only: `invite_context` (intended, returns nothing for garbage codes), plus the pre-existing trigger/event functions `create_default_cvs_for_user`, `map_layouts_lock_streets`, `rls_auto_enable` (not callable as plain functions).
- Storage: `cvs` bucket private with owner-folder policy; `avatars` public with owner-folder write policies.
- Migrations 20261109010000…070000 are recorded in `schema_migrations`; the new 080000 is recorded too.

## Gap found and fixed
**Anon held table privileges (56 grants) on every application table.** RLS blocked all reads (0 rows), so no data leaked, but one wrong future policy would have exposed data to logged-out visitors. Fix: additive migration `supabase/migrations/20261109080000_revoke_anon_table_grants.sql` (revokes table privileges from `anon` only; no data, policies or authenticated access touched; idempotent). Applied live and recorded; afterwards anon gets `permission denied` instead of an empty result. The only unauthenticated server path that touches a table (ICS feed `/api/ics/feed/[token]`) uses the service role and is unaffected.

## Observations (no action taken)
- `20261109070000` data delete (18 empty placeholder CVs) is still deliberately not applied; the signup trigger already creates no default documents.
- `class_notifications.actor_id` and `class_student_aliases.set_by` are `ON DELETE SET NULL` (pointer to the acting teacher on rows owned by another user); after deleting the user no personal data remains and `account_data_report` is empty.
- Storage files are not removed by the database cascade (the app's `/api/account/delete` removes them first with the service role; not re-tested here, covered by `scripts/delete-account-e2e.mjs`).
- `profiles.display_name` accepts an e-mail-like string via direct table update (own row only; the CHECK limits length 60). The name teachers/friends see is `user_roles.display_name`, which is only set through RPCs that reject `@`. Low risk, not changed.
- Initials are computed client-side (covered by unit tests, not SQL); SQL side was verified for the names the UI derives them from (trim, 60 chars, unicode, e-mail rejection, aliases).
- Consent defaults for a new class member: share applications / status / companies all **false**.

## Detailed results

### Setup (2)

- ✅ signup trigger creates user_roles row for each user
- ✅ signup trigger creates NO default placeholder documents (by design since 070000)

### RLS coverage (3)

- ✅ every public table has RLS enabled
- ✅ no public table with FORCE off needed; no policy targets role anon/public
- ✅ every table has >=1 policy OR is intentionally deny-all (info: tables with 0 policies)

### Anonymous (logged-out) access (41)

- ✅ anon select public.application_documents — _permission denied_
- ✅ anon select public.applications — _permission denied_
- ✅ anon select public.calendar_feeds — _permission denied_
- ✅ anon select public.class_announcements — _permission denied_
- ✅ anon select public.class_deadlines — _permission denied_
- ✅ anon select public.class_invitations — _permission denied_
- ✅ anon select public.class_members — _permission denied_
- ✅ anon select public.class_notifications — _permission denied_
- ✅ anon select public.class_student_aliases — _permission denied_
- ✅ anon select public.class_teachers — _permission denied_
- ✅ anon select public.class_view_log — _permission denied_
- ✅ anon select public.classes — _permission denied_
- ✅ anon select public.cvs — _permission denied_
- ✅ anon select public.friendships — _permission denied_
- ✅ anon select public.map_application_rewards — _permission denied_
- ✅ anon select public.map_island_catalog — _permission denied_
- ✅ anon select public.map_islands — _permission denied_
- ✅ anon select public.map_items — _permission denied_
- ✅ anon select public.map_layouts — _permission denied_
- ✅ anon select public.map_shop_catalog — _permission denied_
- ✅ anon select public.map_wallets — _permission denied_
- ✅ anon select public.profiles — _permission denied_
- ✅ anon select public.push_subscriptions — _permission denied_
- ✅ anon select public.reminder_log — _permission denied_
- ✅ anon select public.reminder_settings — _permission denied_
- ✅ anon select public.user_roles — _permission denied_
- ✅ anon holds no table privilege on any public table (defense in depth, migration 080000)
- ✅ anon cannot insert application — _permission denied for table applications_
- ✅ anon update of applications denied — _permission denied for table applications_
- ✅ anon delete of applications denied — _permission denied for table applications_
- ✅ anon-executable function: create_default_cvs_for_user() — _expected only invite_context (intended) + pre-existing trigger/event fns_
- ✅ anon-executable function: invite_context(text) — _expected only invite_context (intended) + pre-existing trigger/event fns_
- ✅ anon-executable function: map_layouts_lock_streets() — _expected only invite_context (intended) + pre-existing trigger/event fns_
- ✅ anon-executable function: rls_auto_enable() — _expected only invite_context (intended) + pre-existing trigger/event fns_
- ✅ anon class_overview denied — _permission denied for function class_overview_
- ✅ anon teacher_dashboard denied — _permission denied for function teacher_dashboard_
- ✅ anon account_delete_summary denied — _permission denied for function account_delete_summary_
- ✅ anon account_delete_prepare denied — _permission denied for function account_delete_prepare_
- ✅ anon account_data_report denied — _permission denied for function account_data_report_
- ✅ invite_context(garbage) does not error and leaks nothing
- ✅ invite_context(null)/(huge) do not crash

### Server-only functions (3)

- ✅ authenticated cannot call account_delete_prepare — _permission denied for function account_delete_prepare_
- ✅ authenticated cannot call account_data_report — _permission denied for function account_data_report_
- ✅ authenticated cannot call _teacher_stats helper — _permission denied for function _teacher_stats_

### Student isolation (s2 attacks s1) (34)

- ✅ s2 sees only own applications (1 of 4 test rows, none of s1)
- ✅ s2 cannot read s1 applications by id
- ✅ s2 cannot read s1 cvs/documents
- ✅ s2 cannot read s1 application_documents
- ✅ s2 cannot read s1 reminder_settings
- ✅ s2 cannot read s1 push_subscriptions
- ✅ s2 cannot read s1 calendar_feeds (ics token)
- ✅ s2 cannot read reminder_log (no policy)
- ✅ s2 cannot read s1 profile
- ✅ s2 cannot read s1 user_roles
- ✅ s2 cannot read s1 friendships
- ✅ s2 cannot read s1 map_wallets/items/layouts
- ✅ s2 update of s1 application changes 0 rows — _affected rows 0, expected 0_
- ✅ s2 delete of s1 application removes 0 rows — _affected rows 0, expected 0_
- ✅ s2 delete of s1 cv removes 0 rows — _affected rows 0, expected 0_
- ✅ s2 update of s1 cv changes 0 rows — _affected rows 0, expected 0_
- ✅ s2 cannot insert application for s1 — _new row violates row-level security policy for table "applications"_
- ✅ s2 cannot steal-ownership of own application to s1 (update user_id) — _new row violates row-level security policy for table "applications"_
- ✅ s2 cannot attach own application to s1 document — _new row violates row-level security policy for table "application_documents"_
- ✅ s2 can create own document
- ✅ s2 cannot attach s1 application to own document — _new row violates row-level security policy for table "application_documents"_
- ✅ s2 can attach own application to own document (positive control)
- ✅ s2 cannot insert push subscription for s1 — _new row violates row-level security policy for table "push_subscriptions"_
- ✅ s2 cannot insert calendar feed for s1 — _new row violates row-level security policy for table "calendar_feeds"_
- ✅ s2 cannot insert reminder_settings for s1 — _new row violates row-level security policy for table "reminder_settings"_
- ✅ s2 cannot write reminder_log (no policy) — _new row violates row-level security policy for table "reminder_log"_
- ✅ s2 cannot make itself teacher by insert into user_roles — _permission denied for table user_roles_
- ✅ s2 UPDATE on own user_roles denied at privilege level (role escalation impossible) — _permission denied for table user_roles_
- ✅ s2 cannot list s1 storage objects in private cvs bucket (0 rows -> division by zero) — _division by zero_
- ✅ s2 cannot call teacher RPC (role=student) — _FORBIDDEN_
- ✅ s2 cannot call teacher_dashboard — _FORBIDDEN_
- ✅ s2 cannot call set_my_role(admin) — _INVALID_REQUEST_
- ✅ s2 map_friend_island(non-friend s1) denied — _NOT_FRIENDS_
- ✅ s2 social_friends_overview empty

### Teacher consent (31)

- ✅ teacher cannot SELECT applications table directly
- ✅ teacher cannot SELECT cvs/documents
- ✅ teacher cannot SELECT profiles
- ✅ teacher cannot SELECT class_members directly
- ✅ teacher cannot read reminders/push/feeds
- ✅ teacher cannot read class_view_log table directly — _permission denied (table not granted)_
- ✅ default consent of a new member (info: share_applications/status/companies) — _false/false/false_
- ✅ share OFF: only hidden placeholder row, no company
- ✅ share OFF: export has no rows for the class
- ✅ share OFF: class_members marks s1 hidden
- ✅ share OFF: timeline is a single hidden placeholder without data
- ✅ companies OFF: no company/position/location, status NULL when status off
- ✅ companies OFF: export has no company/position
- ✅ export never exposes notes/contact (no such columns)
- ✅ all consent ON: companies+status visible
- ✅ all consent ON: result carries no notes/contact column
- ✅ non-sharing member s3 (default) never appears in export
- ✅ non-member student (s2) -> NOT_FOUND — _NOT_FOUND_
- ✅ non-member student (s2) timeline -> error — _NOT_FOUND_
- ✅ non-member s2 absent from class_members list
- ✅ teacher_class_students lists no non-members
- ✅ teacher1 cannot open teacher2 class (overview) — _FORBIDDEN_
- ✅ teacher1 cannot read teacher2 class applications of s2 — _FORBIDDEN_
- ✅ teacher1 cannot export teacher2 class — _FORBIDDEN_
- ✅ teacher1 cannot attention-list teacher2 class — _FORBIDDEN_
- ✅ teacher1 cannot nudge student of teacher2 class — _FORBIDDEN_
- ✅ teacher_dashboard shows only own classes
- ✅ teacher_attention does not list non-sharing s3
- ✅ s1 my_view_log callable
- ✅ s3 my_view_log returns exactly s3 own log rows (none about s1)
- ✅ student cannot call class_overview — _FORBIDDEN_

### Friends privacy (16)

- ✅ companies switch OFF: island payload has no company key — _keys: createdAt,id,status_
- ✅ payload never contains notes/contact/position/location/e-mail
- ✅ outcomes switch OFF: offer is masked (no status "offer") — _applied_
- ✅ house ids are pseudonymous (no real application id)
- ✅ companies switch ON: company names appear
- ✅ companies ON: still no notes/contact/position/location
- ✅ friends overview total only for sharing friend
- ✅ friends overview exposes no company column
- ✅ sharing OFF -> map_friend_island refuses — _NOT_SHARED_
- ✅ sharing OFF -> overview has no totals
- ✅ non-friend s3 cannot view s1 island — _NOT_FRIENDS_
- ✅ friendship is private to its two parties
- ✅ friend cannot read s1 applications table
- ✅ friend cannot send request to self — _CANNOT_ADD_SELF_
- ✅ column default share_companies_with_friends = false
- ✅ fresh user (s2) has company sharing off

### Display names / onboarding (23)

- ✅ fresh user needs_name = true
- ✅ set_display_name trims whitespace
- ✅ after set: needs_name = false
- ✅ empty name rejected — _INVALID_NAME_
- ✅ NULL name rejected — _INVALID_NAME_
- ✅ e-mail as name rejected — _INVALID_NAME_
- ✅ 61 chars rejected — _INVALID_NAME_
- ✅ 60 chars accepted
- ✅ unicode name accepted (Zoë Müller-Çelik)
- ✅ unicode stored intact
- ✅ onboarding save with valid data
- ✅ onboarding sets user_roles.display_name = "first last"
- ✅ onboarding upper-cases canton
- ✅ onboarding rejects canton "ZUERICH" (check constraint) — _new row for relation "profiles" violates check constraint "profiles_onboarding_limits"_
- ✅ onboarding rejects start year 1999 — _new row for relation "profiles" violates check constraint "profiles_onboarding_limits"_
- ✅ onboarding rejects start year 2101 — _new row for relation "profiles" violates check constraint "profiles_onboarding_limits"_
- ✅ onboarding truncates 100-char first name to 40
- ✅ onboarding keeps max 8 professions
- ✅ onboarding with all NULL does not crash
- ✅ direct profiles.display_name 61 chars blocked by CHECK — _new row for relation "profiles" violates check constraint "profiles_onboarding_limits"_
- ✅ teacher alias set for member
- ✅ teacher alias for non-member rejected — _NOT_FOUND_
- ✅ teacher alias of 500 chars rejected — _INVALID_NAME_

### Invite / CSV / input validation RPCs (35)

- ✅ invite_many: NULL array — _INVALID_REQUEST_
- ✅ invite_many: empty array — _INVALID_REQUEST_
- ✅ invite_many: 201 entries — _INVALID_REQUEST_
- ✅ invite_many: expiry 0 days — _INVALID_REQUEST_
- ✅ invite_many: expiry 91 days — _INVALID_REQUEST_
- ✅ invite_many: foreign class — _FORBIDDEN_
- ✅ invite_many: random class id — _FORBIDDEN_
- ✅ invite_many: malformed/duplicate/valid mix classified
- ✅ invite_many: SQL-injection string is just invalid
- ✅ applications table still exists after injection attempt
- ✅ invite_create: bad e-mail — _INVALID_EMAIL_
- ✅ invite_create: max_uses 0 — _INVALID_REQUEST_
- ✅ invite_create: max_uses 501 — _INVALID_REQUEST_
- ✅ invite_create: expiry -1 — _INVALID_REQUEST_
- ✅ class_create: empty name — _INVALID_NAME_
- ✅ class_create: NULL name — _INVALID_NAME_
- ✅ class_create: 101-char name — _INVALID_NAME_
- ✅ deadline: NULL date — _INVALID_REQUEST_
- ✅ deadline: empty title — _INVALID_REQUEST_
- ✅ deadline: 121-char title — _INVALID_REQUEST_
- ✅ deadline: 301-char note — _INVALID_REQUEST_
- ✅ announce: empty — _INVALID_REQUEST_
- ✅ announce: 501 chars — _INVALID_REQUEST_
- ✅ nudge: 201 chars — _INVALID_REQUEST_
- ✅ nudge: valid, then rate limited
- ✅ nudge: second nudge within 3 days rate-limited — _RATE_LIMITED_
- ✅ class_join: garbage code — _CLASS_NOT_FOUND_
- ✅ class_join: NULL code — _CLASS_NOT_FOUND_
- ✅ invite_accept: garbage token — _INVITE_INVALID_
- ✅ invite_accept: NULL token — _INVITE_INVALID_
- ✅ invite bound to other e-mail rejected for s2 — _FORBIDDEN_
- ✅ student cannot read class_invitations (tokens) — _permission denied (table not granted)_
- ✅ student cannot call invite_list — _FORBIDDEN_
- ✅ reminder_settings: days_before -5 rejected by CHECK — _new row for relation "reminder_settings" violates check constraint "reminder_settings_days_before_check"_
- ✅ reminder_settings: stale_days 100000 rejected by CHECK — _new row for relation "reminder_settings" violates check constraint "reminder_settings_stale_days_check"_

### Account deletion cascade (15)

- ✅ data report before deletion lists many tables — _{"cvs.user_id": 1, "user_roles.user_id": 1, "map_layouts.user_id": 1, "map_wallets.user_id": 1, "applicatio…_
- ✅ account_data_report after deletion is empty — _{}_
- ✅ FK to auth.users is SET NULL (not cascade) on class_notifications.actor_id - acceptable: only actor pointer, row belongs to another user — _confdeltype=n_
- ✅ FK to auth.users is SET NULL (not cascade) on class_student_aliases.set_by - acceptable: only actor pointer, row belongs to another user — _confdeltype=n_
- ✅ applications of deleted user gone
- ✅ documents of deleted user gone
- ✅ application_documents gone
- ✅ reminder_log/push/feeds/settings gone
- ✅ class membership/aliases/notifications/view log gone
- ✅ friendships gone; friend (fr) intact
- ✅ profile + user_roles gone
- ✅ other users data untouched (s1 apps still 2)
- ✅ teacher with co-teacher: class survives (transferred to t1)
- ✅ teacher data report empty
- ✅ class rows of deleted teacher gone
