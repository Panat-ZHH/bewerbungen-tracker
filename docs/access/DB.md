# Access model – database (implemented contract)

Migrations (in order, all additive + idempotent):
1. `20261118010000_access_core.sql` – tables, decision functions, signup hooks, go-live switch.
2. `20261118020000_access_guards.sql` – the paywall: restrictive RLS, storage, wrapped RPCs (list: [GUARDS.md](GUARDS.md)).
3. `20261118030000_billing_solo.sql` – solo plan webhook / status functions (billing builder, see docs/billing/).

Tests (PGlite, replay ALL migrations): `tests/access-core-db.test.mjs`, `tests/access-guards-db.test.mjs`;
pure mirror: `lib/access/core.ts` + `tests/access-core.test.mjs` (a parity test compares mirror and SQL).

## Tables

| Table | Purpose | Client access |
|---|---|---|
| `access_settings` (id = 1) | `enforce_mode` 'off' / 'test_users' (default) / 'on', `went_live_at` | none |
| `account_access` | per user: `trial_started_at`, `trial_ends_at`, `free_access_until` + note, `blocked_at` + reason, `enforce_test`, `updated_by` | select own row |
| `trial_ledger` | `email_hash` = sha256(lower(trim(email))) → `first_trial_ends_at`; survives account deletion | none |
| `platform_admins` | WendApply admins (added by `scripts/admin/add-admin.mjs`) | none (`am_i_platform_admin()`) |
| `admin_audit_log` | append-only (trigger refuses update/delete/truncate unless service_role); no FKs so it survives deletions | none |
| `school_teachers` | (school_id, user_id) – teachers linked to a school by its admins | school admins of the school + own rows (select) |
| `billing_customers.user_id`, `billing_subscriptions.user_id` | owner of a `solo` plan; owner check = exactly one of school/family/user; `(plan_id = 'solo') = (user_id is not null)` | via billing RLS (billing builder) |

## Functions

| Function | Who | What |
|---|---|---|
| `app_access(uid) → jsonb` | service role / definer code | `AccessInfo` (lib/access/types.ts) |
| `my_access() → jsonb` | authenticated | `app_access(auth.uid())` |
| `has_app_access(uid default auth.uid()) → bool` | authenticated (self only, else FORBIDDEN), service role (any uid) | THE gate. true for uid null (service role / SQL) and whenever enforcement does not apply |
| `_assert_app_access()` | definer RPCs | raises `PAYWALL` (P0001, German detail) |
| `am_i_platform_admin() → bool` | authenticated | own uid in platform_admins |
| `school_add_teacher(school, email) → jsonb` / `school_remove_teacher(school, user)` | school admins of the school, service role | link teachers; add is rate limited (`school-teacher` 30/h) and refuses student/parent accounts (`NOT_A_TEACHER`), unknown e-mail `USER_NOT_FOUND`; add is gated by access, remove is not |
| `access_go_live() → jsonb` | service role only | mode 'on', `went_live_at`, re-bases pre-existing trials to go-live + 7 days, audit log; idempotent |

Signup hooks on `auth.users`: `access_after_signup` (insert: account_access row + ledger; stores `account_type` parent /
independent_student + birth year from `raw_user_meta_data` into `profiles`, not for teachers) and `access_after_confirm`
(update: an untouched own trial restarts at `email_confirmed_at`, ledger moves along). Both never block a signup (errors → warning).

## The decision (`app_access`)

1. **enforced** = mode 'on', or mode 'test_users' and `enforce_test`, or blocked (and mode ≠ 'off'). Not enforced → `has_access = true`
   (the real `state` is still reported; the UI shows nothing).
2. First match wins: **blocked** → **grant** (`free_access_until > now`) → **school licence** (student in a not-archived class of a
   school with a valid licence, or staff: school_admins / school_teachers / class owner / co-teacher) → own **solo** subscription
   active/trialing → **family**: active member (parent or child) of a family with an active/trialing family subscription or an
   admin-assigned family plan (`pilot`/`active`, source ≠ stripe; the old 30-day family `trial` row does NOT count) → **grace**
   (solo or family `past_due`) → teacher / school admin: **licence_required** (no trial) → **trial** → **expired**.
3. A subscription counts as active only while `current_period_end` is not more than 2 days past (missed webhook safety net).
   `cancel_at_period_end` keeps Stripe status `active` until the period end → access until then. `canceled`, `unpaid`,
   `incomplete`, `incomplete_expired`, `paused` → no access.
4. **role**: user_roles teacher / school_admin → teacher / school_admin; profiles.account_type parent → parent; a user with only a
   `school_admins` row (no class membership) → school_admin (G6); else student.
5. **expired_reason** (state expired / licence_required only): payment_failed (last sub past_due/unpaid) → family_pending (child of
   an unpaid family) → subscription_ended → licence_ended (linked school has licences, none valid) → trial_ended.
   **family_pending**: child in a family without a covering plan (also during the trial).

## CONTRACT CHANGES vs SPEC (all additive)

- `AccessInfo.expired_reason` + `family_pending` (SPEC §8 G12/G14) – added to `lib/access/types.ts`.
- Grace = **7 days from `current_period_start` of the unpaid period**, not `current_period_end + 7 days`: Stripe moves the period
  forward before the renewal is paid, so `current_period_end + 7` would give ~5 free weeks.
- Trial start = `coalesce(email_confirmed_at, created_at)` (SPEC §8 G13), via a second trigger on confirmation.
- `has_app_access(other uid)` by a signed-in user raises `FORBIDDEN` (no probing of other users' billing state).
- `profiles` / `cvs` UPDATE are gated by triggers (not restrictive policies) so "Meine Daten löschen" keeps working (G2).
- API paywall body: `402 {"error":"paywall","message":"…"}`; ai-review error code `paywall` (402).
