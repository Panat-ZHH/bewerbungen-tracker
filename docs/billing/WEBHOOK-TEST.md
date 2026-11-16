# Stripe API + webhook – test report (TEST MODE)

Part `stripe-api` · 2026-11-16 · Stripe sandbox `acct_1UcSQNJBozPvqHEJ` (test mode only) · API version pinned `2026-10-28.endive` (stripe-node 23.1.0).
No database was written: the webhook ran with `BILLING_DB=memory`, and the dev server had **no** Supabase service role key, so it could not reach the live project (bhwreehwirrloxagyypi) at all.

## Code

| File | What |
|---|---|
| `lib/billing/stripe.ts` | Server-only Stripe client (pinned API version), signature check, adapters: price by lookup key, customer, Checkout, invoice subscription, portal. |
| `lib/billing/webhook.ts` | Pure webhook logic: event → full subscription state → `billing_apply_subscription`. Duplicates, unknown events, permanent vs transient errors. |
| `lib/billing/auth.ts` | Bearer token → Supabase user; school admin / parent via the existing SQL helpers `is_school_admin` / `is_family_parent` (called with the caller's JWT). |
| `lib/billing/api.ts` | Pure handlers for checkout / portal / status (flag, validation, auth, already-subscribed). |
| `lib/billing/server.ts` | Wiring: service-role Supabase client (only here), `BILLING_DB=memory` switch (refused when Netlify `CONTEXT=production`). |
| `lib/billing/memory-db.ts` | In-memory `BillingDb` for local runs. |
| `app/api/billing/{checkout,portal,status}/route.ts`, `app/api/stripe/webhook/route.ts` | Thin Node-runtime routes. Webhook reads the raw body (`request.text()`). |

### Behaviour

- **Flag off** (`STRIPE_ENABLED` ≠ `true`): all four routes answer `503 {"error":"billing_disabled","enabled":false}` and touch nothing. Stripe retries a 503 webhook, so nothing is lost when the flag is flipped later.
- Flag on but no Stripe key / no service role key: `503 billing_not_configured`.
- **Auth**: `Authorization: Bearer <Supabase access token>`. 401 without/invalid token, 403 if not admin of `schoolId` / active parent of `familyId` (children: 403). Status is read **with the caller's token**, so the DB checks the role a second time.
- **Checkout** `POST /api/billing/checkout {plan, schoolId|familyId, payment}`: plan must have a lookup key; family plans only for families, school plans only for schools; `invoice` only where `invoiceAllowed` (schools); placeholder plans (family) refused with `409 plan_not_available` when a **live** key is used; `409 already_subscribed` if an active/trialing/past_due subscription exists (changes go through the portal). Reuses the newest `billing_customers` row, else creates a Stripe customer (e-mail of the admin/parent, school/family name, metadata `school_id`/`family_id`/`user_id`).
  - `card`: Checkout Session `mode=subscription`, metadata on session **and** subscription, `locale=de`, billing address required, tax ID collection for schools, return to `/schul-admin` or `/familie` (`?billing=success|cancel`). → `{url}`
  - `invoice`: subscription with `collection_method=send_invoice`, `days_until_due = BILLING.invoiceDaysUntilDue` (30); the first invoice is finalised and sent immediately. → `{url: hosted_invoice_url, invoice: true}`
- **Portal** `POST /api/billing/portal` → `{url}` (uses `STRIPE_PORTAL_CONFIGURATION_ID` if set); `404 no_customer` before the first purchase.
- **Status** `GET /api/billing/status?schoolId=|familyId=` → `{enabled, plan, status, studentLimit, validUntil, cancelAtPeriodEnd, source}` + extras `subscriptionStatus, collectionMethod, latestInvoiceStatus, currentPeriodEnd, hasCustomer, studentsUsed`.
- **Webhook** `POST /api/stripe/webhook`: 400 on missing/invalid signature (also replayed/old timestamps); handled: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Plan = price lookup key (fallback `metadata.plan_id`), period from the subscription items (new API shape), invoice → subscription via `invoice.parent.subscription_details` (legacy `invoice.subscription` too). Answers: 200 applied / duplicate / ignored (foreign or non-subscription objects) / permanent DB error (logged, recorded, no endless retries); 500 for transient errors (Stripe retries).
- **Ordering:** `customer.subscription.*` payloads carry their event time (older snapshots are rejected as `stale_event` by the DB). Checkout and invoice events *retrieve* the current subscription and send **no** event time, so they are never dropped as stale. (First version used the local clock for this; the live run showed it rejecting a newer `cancel_at_period_end` update, so it was replaced.)

## Automated tests (`npm test`)

- `tests/billing-webhook.test.mjs` (13): pinned API version = SDK; signature valid / invalid / wrong secret / missing / tampered body / old timestamp / no secret (503); each event type → exact `billing_apply_subscription` params; checkout session owner (family never gets a school); invoice paid / failed; duplicate event; ordering; unhandled & foreign events; permanent vs transient DB errors; **end to end on PGlite** through the real SQL function (licence `professional/active/stripe/300`, past_due keeps access, deleted, 3 events processed).
- `tests/billing-api.test.mjs` (11): flag off (lib and the real route files), not configured, auth rejection (no/expired token, wrong school, parent on school, child on family), validation, card checkout params + customer reuse, invoice (`send_invoice`, 30 days), already subscribed, missing price, portal, status mapping.
- `tests/account-deletion.test.mjs`: allow-list for `SERVICE_ROLE` now includes `lib/billing/server.ts`.

## Manual run (2026-11-16, test mode)

Setup: `.env.local` (gitignored) with `STRIPE_ENABLED=true`, `BILLING_DB=memory`, the Stripe CLI's test-mode token, `STRIPE_WEBHOOK_SECRET` from `stripe listen --print-secret`, only the two *public* Supabase variables (no service role key). `next dev -p 3000` + `stripe listen --events <the 6 types> --forward-to localhost:3000/api/stripe/webhook`.

**Result: 23 events forwarded, 23 × HTTP 200, no 4xx/5xx.**

| Trigger / action | Events | Outcome |
|---|---|---|
| `stripe trigger customer.subscription.updated` (stock fixture) | sub.created, sub.updated, invoice.paid | ignored `unknown_plan` (not a WendApply price) – correct |
| `stripe trigger invoice.paid` / `invoice.payment_failed` (stock) | invoice.* | ignored `invoice_without_subscription` – correct |
| `stripe trigger checkout.session.completed` (stock) | – | **fixture fails in this account** (Managed Payments, see below); with `--remove checkout_session:payment_intent_data.shipping --add checkout_session:managed_payments[enabled]=false`: event received, ignored `not_a_subscription_checkout` (payment-mode fixture) – correct |
| `stripe trigger customer.subscription.updated --add subscription:metadata.plan_id=starter --add subscription:metadata.school_id=<uuid> …` | sub.created, sub.updated, invoice.paid | **applied**, licence `active`; invoice.paid `applied` (after the ordering fix; before: `stale_event`) |
| Our `createInvoiceSubscription` (Starter, send_invoice) | sub.created | **applied**, licence `active`; status `active`, invoice `open`, due 2026-12-16 (30 days), hosted invoice URL returned |
| Pay that invoice out of band (bank transfer) | invoice.paid | **applied**, `latest_invoice_status=paid` |
| Professional with declined card `pm_card_chargeCustomerFail` | sub.created, invoice.payment_failed | **applied**, status `incomplete` ⇒ no licence (as designed) |
| `cancel_at_period_end=true`, then cancel | sub.updated, sub.deleted | **applied**; deleted keeps the licence until the period end (DB rule) |
| Replay of a real `invoice.paid` with a valid signature, twice | – | `200 {"kind":"duplicate"}` both times |
| Forged signature (curl) | – | `400 invalid_signature` |
| Our `createCheckoutSession` (card, Starter) | – | Checkout URL returned (after the Managed Payments fix) |
| Our `createPortalSession` | – | portal URL returned |
| `POST /api/billing/checkout` on the dev server | – | `503 billing_not_configured` (no service role key on purpose) |

The test objects in the Stripe sandbox carry `metadata.test=stripe-api-local-run` (or come from `stripe trigger`); they are harmless test data.

## Findings for Panat / go-live

1. **Stripe "Managed Payments" is ON by default in this account.** It makes Stripe the merchant of record and rejects Checkout for products without a tax code. The code turns it off per Checkout session (`managed_payments.enabled=false`), so WendApply sells itself with prices excl. MWST as planned. Decide before go-live: keep it off (then VAT is WendApply's job) – or switch it on and give the products tax codes (catalogue script). Dashboard: Settings → Managed payments.
2. **No `sk_test_` key on this Mac.** The new Stripe CLI logs in with an OAuth token (Keychain), not an API key. For this local run that token was used with `STRIPE_ACCOUNT_ID` (Stripe-Account header). For deploy previews and production, create real keys in the dashboard (Developers → API keys; a restricted key is fine) and set `STRIPE_SECRET_KEY` in Netlify – leave `STRIPE_ACCOUNT_ID` unset there.
3. **Invoice subscriptions are `active` immediately** (licence active, invoice open, 30 days to pay). If it stays unpaid, Stripe's dunning settings decide (`past_due` keeps access, `unpaid`/`canceled` ends it). Set "Manage invoices sent to customers" in the dashboard (Settings → Billing → Subscriptions and emails). Swiss QR-bill: not forced in code (`payment_method_types` unset = account defaults); enable it under Settings → Payment methods / Invoice template if the account supports it.
4. Production webhook endpoint: `https://wendapply.ch/api/stripe/webhook` with exactly the 6 events above; its signing secret → `STRIPE_WEBHOOK_SECRET` (production context only).
5. The billing migration must be live before `STRIPE_ENABLED=true` (otherwise the webhook answers 500 and Stripe retries – nothing is lost).

## Re-running locally

```bash
# .env.local: STRIPE_ENABLED=true, BILLING_DB=memory, STRIPE_SECRET_KEY=sk_test_… (or CLI token + STRIPE_ACCOUNT_ID), STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret)
npm run dev
stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to localhost:3000/api/stripe/webhook
stripe trigger customer.subscription.updated --add subscription:metadata.plan_id=starter --add subscription:metadata.school_id=00000000-0000-4000-8000-00000000a001
# watch the dev server log for: stripe webhook {"kind":"applied",…}
```
Never set `BILLING_DB=memory` on Netlify; it is refused in the production context anyway.
