# WendApply Billing (Stripe) – overview

Branch `feature/stripe` · built 2026-11-16 · **Stripe test mode only so far** · switched off by default.
Go-live checklist (German + English): [GO-LIVE.md](GO-LIVE.md).

## What it does

- **Schools** buy a yearly licence (Starter CHF 990 / ≤100 students, Professional CHF 1'490 / ≤300, Enterprise CHF 3'990 / ≤800) – final prices, no VAT (not MWST-registered) – either **by card** (Stripe Checkout) or **by invoice** (Stripe Invoicing, `send_invoice`, 30 days to pay). Pilot (30 days, ≤60 students) and "Individuell" stay manual, no Stripe.
- **Families** (1 student + 1 parent account) buy the family package **by card only**, **monthly CHF 7.90 or yearly CHF 79** (no VAT; yearly saves CHF 15.80). Decided by Panat 2026-11-16. There is no 30-day family trial any more: every user gets the 7-day trial from signup (docs/access/SPEC.md).
- **Students** buy the **Einzelabo** (`solo`) for themselves: **CHF 4.90 / month or CHF 49 / year**, card only, 1 student (access model, 2026-11-17). See "Solo plan" below.
- Stripe webhooks keep `billing_subscriptions` and `school_licences` (`source='stripe'`) in sync. The existing student-limit trigger enforces the seat limit.
- Admins/parents manage, cancel and download invoices in the **Stripe Customer Portal** ("Abo verwalten").
- Access (trial, paywall) is decided by `public.app_access()` (docs/access/); billing only mirrors Stripe into `billing_subscriptions`.

## Feature flag

| Env | Where | Effect |
|---|---|---|
| `STRIPE_ENABLED=true` | server | API + webhook active. Otherwise every billing route returns `503 {"error":"billing_disabled"}`. |
| `NEXT_PUBLIC_STRIPE_ENABLED=true` | client (build time) | Buy/manage buttons in `/schul-admin`, `/familie` and `/preise`. Otherwise the honest copy "WendApply ist aktuell kostenlos. Online-Bezahlung folgt." |

Other env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (server only), optional `STRIPE_PORTAL_CONFIGURATION_ID`, `APP_URL`. Local only: `STRIPE_ACCOUNT_ID` (with the Stripe CLI token), `BILLING_DB=memory` (refused in Netlify production). See `.env.example`.

## Map of the code

| Part | Files | Doc |
|---|---|---|
| Catalogue (single price source) | `lib/billing/plans.ts`, `scripts/stripe/setup-products.mjs` | [CATALOG.md](CATALOG.md) |
| Database | `supabase/migrations/20261116200000_billing_stripe.sql` (+ later billing migrations, solo: `20261118030000_billing_solo.sql`), `lib/billing/db-types.ts` | [DATA-MODEL.md](DATA-MODEL.md) |
| API + webhook | `lib/billing/{api,auth,webhook,stripe,server,memory-db}.ts`, `app/api/billing/{checkout,portal,status}`, `app/api/stripe/webhook` | [WEBHOOK-TEST.md](WEBHOOK-TEST.md) |
| UI | `components/billing/*`, `components/family/plan-card.tsx`, `/schul-admin`, `/familie`, `/preise` | [UI.md](UI.md) |

## Billing phases (family flow, BILLING-FLOW-SPEC §3.5)

`billingPhase()` in `components/billing/logic.ts` turns `GET /api/billing/status` into one of
`none | incomplete | trialing | active | past_due | canceling | paused | unpaid | ended`. The family UI uses only this phase.
Badges and texts come from `FAMILY_COPY` (`lib/family-copy.ts`) via `phaseBadge()` / `phaseText()`.

- `hasSubscription()` is false for `ended`, so a family can buy the plan again after it ended.
- Checkout answers 409 `already_subscribed` for active, trialing, past_due, unpaid and paused subscriptions, **including
  ones set to cancel at period end**. Those are renewed in the portal, never bought twice (`OPEN_SUBSCRIPTION_STATUSES`).
- The portal returns families to `/familie?billing=portal` (`portalReturnUrl`); the page reloads the status silently.
- `BillingBanner` (past_due / unpaid) sits on top of `/familie` for parents. Children never see payment states (S8).
- With the flag ON, a 503 says `FAMILY_COPY.api.unreachable`, never "noch nicht freigeschaltet".
- Unit tests: `tests/billing-phase.test.mjs`. Student flow e2e: `scripts/family-student-flow-e2e.mjs` (both flag states).

## Tests

| What | Command | Result 2026-11-16 (merged branch) |
|---|---|---|
| Unit + PGlite SQL tests | `npm test` | **611/611** pass (billing: plans, db, api, webhook, ui) |
| Lint / build | `npm run lint`, `npm run build` | 0 errors (9 old warnings) / build OK |
| UI E2E both flag states (mocked API) | `node scripts/billing-ui-e2e.mjs` | **114/114** |
| Stripe sandbox E2E (real Checkout + webhook) | `node --experimental-strip-types scripts/billing-stripe-e2e.mjs` | **16/16** |

### Stripe sandbox E2E (2026-11-16)

Setup: `next dev -p 3100` with `STRIPE_ENABLED=true`, `BILLING_DB=memory` (no Supabase involved) + `stripe listen` forwarding the 6 events. The script calls the real API logic with a fake "is admin/parent" auth and the real Stripe adapter, then pays the hosted Checkout page in headless Chrome with test card `4242 4242 4242 4242`.

- **School card** (Starter): Checkout → paid → redirect `/schul-admin?billing=success`; subscription `active` with `plan_id`/`school_id`; webhook applied `checkout.session.completed`, `customer.subscription.created`, `invoice.paid`, licence `active`.
- **School invoice** (Professional): hosted invoice URL; `send_invoice`, `open`, due in 30 days, CHF 1'490.00; licence `active` right away; paid out of band → `invoice.paid` applied.
- **Family card**: Checkout → paid → `/familie?billing=success`; subscription with `family_id`; webhook applied. Invoice for families → `400 invoice_not_allowed`.
- **Portal**: `billing.stripe.com` session URL for the school customer.
- **Live guard**: plans marked `placeholder: true` are refused with a live key (`409 plan_not_available`); since 2026-11-16 no plan is a placeholder.
- **Family monthly/yearly** (2026-11-16): test-mode Checkout sessions for both prices open with CHF 7.90 / CHF 79; the webhook maps both lookup keys to `family`.
- Webhook delivery: 17 × 200. 2 × 500 came from an expired CLI token mid-run; they are transient errors that Stripe retries by design.
- HTTP: forged signature → `400 invalid_signature`; flag on but no service-role key → `503 billing_not_configured`.
- **Flag off**: `checkout`, `portal`, `status`, `webhook` → all `503 billing_disabled`; `/preise` shows "WendApply ist aktuell kostenlos. Online-Bezahlung folgt." and no buy buttons.

Screenshots: `screenshots/stripe-checkout-*.png` (sandbox Checkout before paying) and the UI states in `screenshots/`.

### Running the sandbox E2E yourself

```bash
# .env.local (gitignored): STRIPE_SECRET_KEY=<sk_test key, or the Stripe CLI token + STRIPE_ACCOUNT_ID>, STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret)
STRIPE_ENABLED=true NEXT_PUBLIC_STRIPE_ENABLED=true BILLING_DB=memory npx next dev -p 3100 > /tmp/dev.log 2>&1 &
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed --forward-to localhost:3100/api/stripe/webhook &
PLAYWRIGHT=<path>/playwright-core/index.mjs CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" DEV_LOG=/tmp/dev.log \
  node --experimental-strip-types scripts/billing-stripe-e2e.mjs
```
The script aborts if Stripe answers in live mode. The Stripe CLI's OAuth token expires after about 1 hour; refresh it if Stripe returns 401.

## Test catalogue (sandbox `acct_1UcSQNJBozPvqHEJ`)

| Plan | Product | Price (lookup key `wendapply_<plan>_yearly_chf`) |
|---|---|---|
| starter | `prod_Vdl0uwfRsr4OWU` | `price_1UcTUVJBozPvqHEJafoI4HRT` |
| professional | `prod_Vdl0h8zENNH4JM` | `price_1UcTUZJBozPvqHEJ1CvqWZwQ` |
| enterprise | `prod_Vdl0MWDVOefzPa` | `price_1UcTUdJBozPvqHEJoUXCW847` |
| family | `prod_Vdl0VIPC2oWhBz` | yearly CHF 79 `price_1UcUZvJBozPvqHEJQuKm7P53`, monthly CHF 7.90 `price_1UcUa5JBozPvqHEJ5unlOB0E` (`wendapply_family_monthly_chf`) |
| solo | `prod_Ve0CvTPDnlOjB3` | yearly CHF 49 `price_1UciCPJBozPvqHEJt6t6pjAe`, monthly CHF 4.90 `price_1UciCRJBozPvqHEJOxvDwxa4` (`wendapply_solo_monthly_chf`) – created 2026-11-17 |

Code never uses these IDs. It looks prices up by lookup key, so live mode just needs the same script run with `--live`.

## Security review (2026-11-16)

- **No secrets in git.** The strict scan `git log -p feature/stripe ^origin/main | grep -E '(sk|rk)_(test|live)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{20,}|oak_…|eyJ…'` is empty. The literal scan from the plan (`grep -E 'sk_(test|live)_|whsec_|rk_'`) has 9 hits. They are all placeholders in docs/`.env.example` (`sk_test_…`), the live-key regex in `stripe.ts`, a no-secret assertion in a test, and one dummy test constant `whsec_unit_test_only_not_a_real_secret`. `.env*` is gitignored; `.env.local` was never committed.
- **Service-role key** is only read in `lib/billing/server.ts` (an allow-list test enforces this), and it never reaches client bundles.
- **Webhook**: raw-body signature check (`constructEvent`, timestamp tolerance), idempotency via `stripe_events`, out-of-order protection (stale snapshots rejected), permanent errors acknowledged (no retry storm), transient errors → 500 (retry).
- **Authorisation**: bearer token → Supabase user; school admin / parent checked by the DB helpers with the caller's JWT; status read with the caller's token (RLS checks again). Children cannot buy. New tables have RLS; writes only via the `service_role`-only security-definer function.
- **Amounts** always come from Stripe prices (lookup key), never from the client. Placeholder prices are refused with a live key.
- `BILLING_DB=memory` throws in Netlify's production context.
- Error responses are generic (`billing_failed`) and logs contain no secrets.
- Decided 2026-11-16: no VAT (not MWST-registered, `BILLING.vatRegistered=false`, no VAT wording); Stripe "Managed Payments" stays off per session. Open point: rate limiting on `/api/billing/checkout` relies on auth + one open subscription per owner.

## Solo plan ("Einzelabo", access model 2026-11-17)

Owner = one user (the student themselves). `billing_customers.user_id` / `billing_subscriptions.user_id`, plan_id `solo`,
no `school_licences` row: access comes from `public.app_access()` (reason `subscription`, grace on `past_due`).

**Who may buy:** students only (`user_roles.role` student and `profiles.account_type` school_student / independent_student).
Parents buy the family package, teachers / school admins get access only through a school licence.

### `POST /api/billing/checkout` – `{ "plan": "solo", "interval": "month" | "year", "owner"?: "me", "ui"?: "hosted" | "elements" }`

| Answer | When |
|---|---|
| `200 { url }` / `200 { clientSecret }` (ui elements) | Checkout Session for the caller. Success → `/abo?billing=success&session_id=…`, cancel → `/abo?billing=cancel`; in-app return → `/abo?billing=success&session_id=…`. |
| `400 invalid_owner` | `schoolId` / `familyId` sent, or `owner` other than `"me"`. |
| `400 invoice_not_allowed` / `invalid_interval` / `invalid_ui` | as for the family plan. |
| `401 unauthenticated` | no / invalid token. |
| `403 solo_parent_use_family` | caller is a parent (→ family package). |
| `403 solo_students_only` | teacher / school admin (or anything that is not a student account). |
| `409 { error: "already_subscribed", coveredBy: "solo" \| "family" \| "school" }` | own open solo subscription (trialing / active / past_due / unpaid / paused / incomplete, also when set to cancel at period end → renew in the portal), covered by a family subscription / admin family plan, or a valid school licence. |
| `409 { error: "already_subscribed" }` | Stripe already has an open subscription on the customer (paid seconds ago, webhook lag). |

Stripe metadata (customer, session, subscription): `app=wendapply`, `plan_id=solo`, `interval`, **`owner_type=user`**, `user_id=<caller>`.
The rules live in `public.billing_solo_eligibility(uid)` (service role) → `{ role: student|parent|staff, account_type, covered_by }`.

### `GET /api/billing/status?owner=me` – the caller's own solo subscription

```json
{ "enabled": true, "owner": "me", "plan": "solo" | null, "status": "active" | "grace" | "expired" | null,
  "interval": "month" | "year" | null, "studentLimit": 1 | null, "validUntil": "YYYY-MM-DD" | null, "graceUntil": "ISO" | null,
  "cancelAtPeriodEnd": false, "source": "stripe" | null, "subscriptionStatus": "active" | … | null,
  "collectionMethod": "charge_automatically" | null, "latestInvoiceStatus": "paid" | … | null,
  "currentPeriodEnd": "ISO" | null, "hasCustomer": true, "studentsUsed": null }
```

`status`: `active` (Stripe active / trialing), `grace` (past_due, access until `graceUntil` = period start + 7 days),
`expired` (canceled / unpaid / incomplete_expired / paused / past grace), `null` = never subscribed. `validUntil` = grace end
while in grace, else the period end (Zurich date). Read with the caller's token via `public.billing_status_for_user(uid)`.
For the paywall itself use `my_access()` (lib/access), not this endpoint.

### Portal and session
- `POST /api/billing/portal { "owner": "me" }` → the caller's own customer only (`404 no_customer` if none); returns to `/abo?billing=portal`.
- `GET /api/billing/session?id=cs_…` → for a solo session only its buyer gets `{ status, paymentStatus, plan: "solo", interval, owner: "me" }`, everybody else 404.

### Webhook
Lookup keys `wendapply_solo_monthly_chf` / `wendapply_solo_yearly_chf` (or `metadata.plan_id=solo`) → `billing_apply_user_subscription`
(service role). The owner is `metadata.user_id` **only when `metadata.owner_type = 'user'`** (every subscription carries
`user_id` = the buyer, so `user_id` alone never makes a subscription personal). Later events without metadata apply via the
known customer. A solo price on a school / family subscription, or a school / family price on a personal subscription, is
acknowledged and ignored (`plan_owner_mismatch`). Signature check unchanged.

### Account deletion
`account_billing_blockers(uid)` also lists the user's own renewing solo subscription (`kind: "solo"`), so
`/api/account/delete` answers 409 `SUBSCRIPTION_ACTIVE` until it is canceled in the portal (cancel at period end is enough).

Tests: `tests/billing-solo-api.test.mjs`, `tests/billing-solo-db.test.mjs`.
