# Access model – what the migrations do to existing data

Applies to `20261118010000_access_core.sql` and `20261118020000_access_guards.sql` (plus `20261118030000_billing_solo.sql`).
All three are additive and idempotent (safe to run twice). Live state on 2026-11-17: 5 users, 0 school licences, 0 subscriptions,
0 teachers (FINDINGS.md #10).

## Existing users

- Every existing auth user gets an `account_access` row: `trial_started_at = created_at`,
  `trial_ends_at = greatest(created_at + 7 days, now() + 7 days)`, and a `trial_ledger` row for their e-mail.
  Nobody is locked out by surprise.
- `access_settings.enforce_mode` starts as **`test_users`**: the paywall applies ONLY to accounts with `enforce_test = true`
  (throwaway e2e users created by the service role). For everybody else `has_app_access()` is true and `my_access().enforced`
  is false → the UI shows no banner, no paywall. Netlify previews share this database, so this is what makes preview testing safe.
- `public.access_go_live()` (service role, after Panat's yes – see GO-LIVE.md) switches to `on` and re-bases every pre-existing
  trial to **go-live + 7 days** (never shortens one). It is logged in `admin_audit_log`.
- Existing family plan rows with status `trial` (30 days) no longer grant access by themselves. Live has 1 family and 0 paid
  plans, so the parent gets the same 7-day trial as everyone. Admin-assigned `pilot` / `active` family plans still grant access.
- Teachers / school admins: no trial; access only via a valid school licence or an admin grant. Live has 0 teachers.

## Schema changes on existing tables

- `billing_customers` / `billing_subscriptions`: new nullable `user_id`; owner checks now "exactly one of school / family / user";
  plan list gains `solo`. Existing rows satisfy the new checks (they have exactly one of school / family).
- `profiles`, `cvs`, `applications`, `application_documents`, `push_subscriptions`, `reminder_settings`, `calendar_feeds`,
  `class_goals`, `storage.objects` (cvs, avatars): new RESTRICTIVE policies / BEFORE UPDATE triggers – no data change.
- 45 definer RPCs are renamed to `_acc_impl_<name>` and get a wrapper with the same name/arguments/grants (GUARDS.md).
  Clients call exactly the same names; nothing changes while enforcement does not apply.
- New triggers on `auth.users`: `access_after_signup` (after insert) and `access_after_confirm` (after update). Both swallow
  their own errors (warning) so a signup or login can never fail because of them.

## Signup metadata

The insert trigger stores `raw_user_meta_data.account_type` (`parent` / `independent_student` + `birth_year`) in `profiles`
right away, so the client sync (`account_set_type` after the first login) is no longer needed (it still works and is harmless).
School students keep their old flow (type follows class membership).

## Rollback

- Instant, no deploy: `update public.access_settings set enforce_mode = 'off' where id = 1;` (SQL editor / service role) → every
  check returns true, banners disappear (`enforced = false`). Blocks are ignored in `off` too.
- The tables, columns and wrappers can stay; they are inert in mode `off`.
