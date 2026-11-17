# Billing data model (Stripe)

Migration: `supabase/migrations/20261116200000_billing_stripe.sql` · Types: `lib/billing/db-types.ts` · Tests: `tests/billing-db.test.mjs` (PGlite, all migrations in order).

**Not applied to the live project yet.** Apply it only with Panat's approval (see the safety review below).

## Idea

Stripe is the source of truth for payments. The database keeps a small mirror and turns it into a **licence row** in the existing `public.school_licences` table. All existing seat logic (`_school_assert_capacity`, `class_members_licence_check`, `classes_licence_check`, `_family_assert_seat`) is unchanged and simply sees one more licence row. The newest *usable* licence governs, exactly as before.

```
Stripe webhook ──(service role)──> billing_apply_subscription(...)
                                     ├─ stripe_events          (idempotency, no payload)
                                     ├─ billing_customers      (cus_… -> school or family)
                                     ├─ billing_subscriptions  (sub_… mirror: plan, status, period, invoice state)
                                     └─ school_licences        (one row per sub_…, source = 'stripe')
UI / API ──(user)──> billing_status_for_school(id) / billing_status_for_family(id)
```

## Tables

| Table | Key | Owner | Notes |
|---|---|---|---|
| `billing_customers` | `stripe_customer_id` unique | exactly one of `school_id` / `family_id` | `created_by` = user who started the first checkout (nulled when the user is deleted). Not unique per owner on purpose (a race-created duplicate customer must not make webhooks fail); the API reuses the newest one. |
| `billing_subscriptions` | `stripe_subscription_id` unique | exactly one of `school_id` / `family_id`; `plan_id = 'family'` ⇔ family | `status` = Stripe status 1:1, `current_period_start/end`, `cancel_at_period_end`, `collection_method` (`charge_automatically` / `send_invoice`), `latest_invoice_status`, `licence_id`, `last_event_at` (out-of-order guard). |
| `stripe_events` | `id` (`evt_…`) | – | `type`, `received_at`, `processed_at`. Service role only. |
| `school_licences` (extended) | – | – | New: `source` (`manual` \| `pilot` \| `stripe`, default `manual`), `stripe_subscription_id` (unique when set; set ⇔ `source = 'stripe'`). `status` and `valid_until` already existed. |

Owners are deleted with `ON DELETE CASCADE` (school or family gone ⇒ its billing rows go too; Stripe keeps the invoices, which is where the accounting records legally live).

## Stripe status → licence

| Stripe `status` | Licence row (`source = 'stripe'`) |
|---|---|
| `active`, `trialing`, `past_due` | `status = 'active'`, `valid_from`/`valid_until` = current period (Europe/Zurich dates). `past_due` keeps access only for a grace period after the (unpaid) period start: 14 days card, 44 days invoice (migration 20261117100000). |
| `canceled` (subscription deleted) | stays `active` with `valid_until` = period end, or Stripe's `ended_at` if it was cancelled earlier (immediate cancel / refund / dunning) ⇒ usable until then, `expired` afterwards (computed by `_licence_state`). |
| `unpaid`, `incomplete_expired` | `expired` (no new joins; existing students keep their data). |
| `paused` | school `expired`, family `paused`. |
| `incomplete` | no licence yet (first payment pending); an existing row is not changed. |

Plan → package: `starter` / `professional` / `enterprise` keep their name (limits 100 / 300 / 800 from `_licence_default_limit`), `individual` → `custom` (needs `p_student_limit`), `family` → `family` (1 parent + 1 child via the existing family defaults). Upgrades and downgrades update the same row. A downgrade below the current number of students never removes anyone; only new joins are refused (WA001).

Manual and pilot rows are **never** written by `billing_apply_subscription`. Existing pilot rows were relabelled `source = 'pilot'`, new ones get it from a trigger.

## Functions

### `billing_apply_subscription(...)` – service role only
EXECUTE is granted to `service_role` only, and the body refuses any caller with `auth.uid()`. Parameters (named, see `BillingApplySubscriptionParams`):
`p_stripe_customer_id, p_stripe_subscription_id, p_plan_id, p_status, p_current_period_end, p_current_period_start, p_cancel_at_period_end, p_collection_method, p_latest_invoice_status, p_school_id, p_family_id, p_created_by, p_student_limit, p_event_id, p_event_type, p_event_created`.

- Send the **full current state** of the subscription on every event (`checkout.session.completed` → retrieve the subscription; `invoice.paid` / `invoice.payment_failed` → retrieve the invoice's subscription and pass `p_latest_invoice_status`). The owner (`p_school_id` / `p_family_id`, from subscription/checkout metadata) is required the first time a customer is seen.
- Idempotent: identical input ⇒ identical state. `p_event_id` already processed ⇒ `{applied:false, reason:'duplicate_event'}`. The webhook may insert into `stripe_events` itself first; only rows with `processed_at` count as duplicates. `p_event_created` older than the last applied event ⇒ `reason:'stale_event'`. School/family deleted meanwhile ⇒ `reason:'owner_not_found'` (answer 200 so Stripe stops retrying).
- Atomic (one function = one transaction) and serialised per subscription (`pg_advisory_xact_lock`).
- Returns `{ applied, reason?, subscription_id, licence_id, licence_status }`. Errors (message): `INVALID_REQUEST`, `INVALID_PLAN`, `INVALID_STATUS`, `BILLING_OWNER_REQUIRED`, `BILLING_OWNER_MISMATCH`, `LICENCE_LIMIT_REQUIRED`, `FORBIDDEN`. Validation errors are permanent: log them and answer 200/400, do not let Stripe retry forever.

### `billing_status_for_school(p_school_id)` / `billing_status_for_family(p_family_id)`
For school admins of that school / active parents of that family (children: `FORBIDDEN`), and the service role. Returns JSON (`BillingStatusForSchool` / `BillingStatusForFamily`):
`plan, state, licence_status, source, student_limit, valid_until, subscription_status, cancel_at_period_end, current_period_end, collection_method, latest_invoice_status, has_customer` (+ `school_id, students_used` / `family_id`). The API maps it to the camelCase contract `{ enabled, plan, status: state, studentLimit, validUntil, cancelAtPeriodEnd, source }`.

## Access (RLS)

| | anon | student / child / teacher | school admin | parent | service role |
|---|---|---|---|---|---|
| `billing_customers`, `billing_subscriptions` | – | – | SELECT own school | SELECT own family | all |
| `stripe_events` | – | – | – | – | all |
| `school_licences` | – | – | SELECT own (+ new `source` column) | via RPC | all |
| `billing_apply_subscription` | – | – | – | – | EXECUTE |
| `billing_status_for_*` | – | FORBIDDEN | own school | own family | EXECUTE |

No user can insert/update/delete any billing row. The service role key exists only on the server (webhook / API routes).

## Privacy

No card data, no e-mail addresses, no event payloads are stored, only Stripe ids, plan, status and dates. `billing_customers.created_by` references the user, so the row is part of “Meine Daten herunterladen” (`export_my_data`) and is nulled on account deletion.

## Safety review for the live apply

Checked against the migration text and run on PGlite with all earlier migrations (and run twice: idempotent).

- **Destructive?** No. No `DROP TABLE/COLUMN`, no data deleted. The only `DROP`s are `drop constraint if exists` / `drop policy if exists` / `drop trigger if exists` for objects this migration (re)creates itself. One data change: `update school_licences set source = 'pilot' where source = 'manual' and package = 'pilot'`, which is a label on a brand-new column (it fires the existing licence triggers with unchanged values, harmless).
- **Existing rows:** every existing licence gets `source = 'manual'` (or `'pilot'`), `stripe_subscription_id = null`. Both new checks (`source in (...)`, `(source = 'stripe') = (stripe_subscription_id is not null)`) hold for all existing rows, so adding them cannot fail. Seat checks, licence states and RPC outputs for existing schools/families are unchanged (only the newest usable licence governs, as before).
- **Locks:** `ALTER TABLE school_licences ADD COLUMN ... DEFAULT 'manual'` is metadata-only (constant default, Postgres 11+), but takes a short `ACCESS EXCLUSIVE` lock; adding the two CHECK constraints scans the table under that lock and the partial unique index takes a `SHARE` lock. `school_licences` has a handful of rows, so this is milliseconds. New tables lock nothing existing. Still: apply outside school hours, and it waits behind any long transaction on `school_licences`.
- **Privileges:** new tables revoke everything from `anon`/`authenticated` (Supabase's default grants), then grant SELECT only. All new functions revoke EXECUTE from `public, anon, authenticated` and grant explicitly. `tests/migrations.test.mjs` (SECURITY DEFINER pins `search_path`, nothing new callable by anon, RLS on every table) stays green.
- **Dependencies:** needs `schools`, `school_licences`, `families`, `family_members`, `is_school_admin`, `_licence_state`, `_licence_default_limit`, `_school_current_licence`, `_family_current_plan`, `_family_plan_state` – i.e. `20261116100000`…`20261116140000` must be live first.
- **Rollback (if ever needed, manual):** drop the three tables and the functions `billing_apply_subscription`, `billing_status_for_school`, `billing_status_for_family`, `_billing_status_json`, `is_family_parent`, `_licence_source_default` (+ trigger `school_licences_source_default`); delete the `source = 'stripe'` licence rows; the two columns can stay (harmless) or be dropped.
- **Before applying live:** backup (Supabase dashboard), apply in the SQL editor or `supabase db push` *with approval*, then run `select public.billing_status_for_school(id) from public.schools limit 3;` as a smoke test.

## Solo plan ("Einzelabo") – 20261118010000_access_core.sql + 20261118030000_billing_solo.sql

- Columns: `billing_customers.user_id`, `billing_subscriptions.user_id` (→ auth.users, on delete cascade). Owner check: exactly
  one of `school_id` / `family_id` / `user_id`; `plan_id = 'solo'` ⇔ `user_id` set. No `school_licences` row for solo:
  `public.app_access()` reads the subscription directly (active/trialing = access, past_due = 7-day grace from the period start).
- `billing_apply_user_subscription(p_stripe_customer_id, p_stripe_subscription_id, p_status, p_current_period_end,
  p_current_period_start, p_cancel_at_period_end, p_collection_method, p_latest_invoice_status, p_user_id, p_plan_id = 'solo',
  p_event_id, p_event_type, p_event_created)` – service role only (refuses any signed-in caller with FORBIDDEN). Same rules as
  `billing_apply_subscription`: processed event → `duplicate_event`, older `p_event_created` → `stale_event`, advisory lock
  `billing_sub:<id>`, customer created on first sight with `user_id = created_by = p_user_id` and never re-owned. Errors:
  `BILLING_OWNER_REQUIRED` (new customer without user), `BILLING_OWNER_MISMATCH` (other user / subscription of another customer),
  `INVALID_PLAN` (customer of a school / family, or plan ≠ solo), `INVALID_STATUS`, `INVALID_REQUEST`. Unknown user (account
  deleted) → `owner_not_found`, acknowledged. Deliberately a NEW name, not an overload of `billing_apply_subscription`
  (named-arg calls from supabase-js would become ambiguous).
- `billing_status_for_user(p_user_id)` – authenticated (own uid only, else FORBIDDEN) + service role. Shape: README "Solo plan".
- `billing_solo_eligibility(p_user_id)` – service role only: `{ role, account_type, blocked, covered_by }` for the checkout gate.
- `account_billing_blockers(uid)` – now also `kind: 'solo'` for the user's own renewing solo subscription.
- RLS: policies "solo owner reads own customer" / "solo owner reads own subscriptions" (`user_id = auth.uid()`), OR-ed with
  the school admin / parent policies. No direct writes for users (unchanged grants).
