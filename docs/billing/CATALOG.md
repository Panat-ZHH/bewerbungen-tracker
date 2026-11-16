# WendApply billing catalogue (Stripe)

Single source of truth: **`lib/billing/plans.ts`**. Everything else reads from it:
`lib/b2b/licence.ts` (`SCHOOL_PACKAGES`, `PILOT_DAYS`, `formatChf`), `components/public/marketing.ts` (`PACKAGES`, `PILOT`),
the billing API/UI and `scripts/stripe/setup-products.mjs`, which mirrors it into Stripe.

## Plans

| Plan | Kind | CHF / year (excl. MWST) | Students | Stripe lookup key | Card (Checkout) | Invoice |
|---|---|---|---|---|---|---|
| pilot | school | 0 (30 days, 1–2 classes) | 60 | – (licence row only) | – | – |
| starter | school | 990 | 100 | `wendapply_starter_yearly_chf` | yes | yes |
| professional | school | 1'490 | 300 | `wendapply_professional_yearly_chf` | yes | yes |
| enterprise | school | 3'990 | 800 | `wendapply_enterprise_yearly_chf` | yes | yes |
| individual | school | contact | individual | – | – | – |
| family | family | **49 – PLACEHOLDER, Panat to decide** | 1 parent + 1 child | `wendapply_family_yearly_chf` | yes | – (card only) |

`BILLING`: currency `chf`, `vatIncluded: false` (Stripe prices use `tax_behavior=exclusive`), yearly only
(`monthlySurchargePct: 0`), invoices due after 30 days. The old `MONTHLY_SURCHARGE` in licence.ts is only for manual offers.
The public Familien page keeps showing "Preis folgt" (`FAMILY.pricePerYear = null`) until the family price is decided.

Feature flags: `STRIPE_ENABLED=true` (server) and `NEXT_PUBLIC_STRIPE_ENABLED=true` (client). Anything else = off.

## Stripe objects

- **Product** per paid plan, found by `metadata.plan_id` (+ `metadata.app=wendapply`); metadata `plan_id`, `student_limit`, `kind`.
- **Price** per plan: CHF, recurring yearly, `tax_behavior=exclusive`, `lookup_key` as above, set as the product's default price.
  Code must always look prices up by **lookup key** (`prices.list({ lookup_keys: [...] })`), never by hard-coded `price_…` ID.
  `planByLookupKey()` maps a price back to the plan (e.g. in the webhook).
- **Customer Portal configuration** (`metadata.wendapply_portal=default`): cancel at period end (no proration),
  update payment method, invoice history, update e-mail/address/name/tax ID; plan switching off; return URL
  `https://wendapply.ch/schul-admin`, privacy policy `https://wendapply.ch/datenschutz`. In the test sandbox it is the
  account default; its ID is also written to `.env.local` as `STRIPE_PORTAL_CONFIGURATION_ID` (not secret) – pass it as
  `configuration` when creating portal sessions and override `return_url` per session (e.g. `/familie` for families).

Test-mode IDs (sandbox `acct_1UcSQNJBozPvqHEJ`, created 2026-11-16):

| Plan | Product | Price |
|---|---|---|
| starter | `prod_Vdl0uwfRsr4OWU` | `price_1UcTUVJBozPvqHEJafoI4HRT` |
| professional | `prod_Vdl0h8zENNH4JM` | `price_1UcTUZJBozPvqHEJ1CvqWZwQ` |
| enterprise | `prod_Vdl0MWDVOefzPa` | `price_1UcTUdJBozPvqHEJoUXCW847` |
| family | `prod_Vdl0VIPC2oWhBz` | `price_1UcTVGJBozPvqHEJ2M9A65vb` |
| portal | `bpc_1UcTUkJBozPvqHEJwjgKCpGU` | |

(The family price was changed 49 → 59 → 49 once to test the price-change path, so two archived family prices exist.)

## Running the setup script

```bash
node scripts/stripe/setup-products.mjs             # test mode (default)
node scripts/stripe/setup-products.mjs --dry-run   # show what would change, no writes
node scripts/stripe/setup-products.mjs --json      # also print a JSON summary
```

Auth: `STRIPE_SECRET_KEY` (a `sk_test_`/`rk_test_` key) from the environment or `.env.local`; without it the script uses
the logged-in Stripe CLI (`~/.local/bin/stripe`, or `STRIPE_CLI=/path`). It never prints keys. Re-running it is safe:
a second run reports `Created: 0 Updated: 0` and makes no API writes.

**Live mode** (only after Panat's explicit go, see GO-LIVE.md): `STRIPE_ALLOW_LIVE=yes STRIPE_LIVE_SECRET_KEY=… node scripts/stripe/setup-products.mjs --live`
(or a live-logged-in CLI). Without `STRIPE_ALLOW_LIVE=yes` the script exits with code 2. Plans marked
`placeholder: true` (family) are **skipped** in live mode until the price is decided.

## How to change a price

1. Edit `priceChfPerYear` (and/or `studentLimit`) of the plan in `lib/billing/plans.ts`. For the family plan also remove
   `placeholder: true` and the PLACEHOLDER comment once the price is final, and set `FAMILY.pricePerYear` in marketing.ts.
2. `npm test` (prices on the public pages and in licence.ts follow automatically; adjust tests that pin old amounts,
   e.g. `tests/b2b-site.test.mjs`, `tests/billing-plans.test.mjs`).
3. Run the setup script (test first, then live with approval). For a changed amount it creates a new Price with
   `transfer_lookup_key=true` (the lookup key moves to the new price) and archives the old one. Existing subscriptions
   keep their old price until they are migrated (Dashboard or API); new checkouts use the new price immediately.
4. Changing the seat limit only updates product metadata `student_limit`; the enforced limit lives in the DB licence row
   (written by the webhook from `PLANS[plan].studentLimit`).

To add a plan: add a `PlanId`, an entry in `PLANS` with a new `wendapply_<id>_yearly_chf` lookup key, run the script.

## Invoices and Swiss QR-bill (checked 2026-11-16, test sandbox)

Account country CH, default currency CHF, `charges_enabled=false` (account not activated yet).
Payment methods available in the default payment method configuration: card, Apple Pay, Google Pay, Link.
`customer_balance` (bank transfer) is **not available**, and the Payment Method Configuration offers **no Swiss QR-bill**
method. (Stripe's bank-transfer/customer-balance product does not support CHF.)

Consequence: invoice payment (`collection_method=send_invoice`, `days_until_due=30`) works, but the hosted invoice page
and the invoice PDF only offer card payment. Options for real bank payment by schools, to decide before go-live:
- add the IBAN / bank details as invoice footer or custom field (`invoice_settings.footer`, `custom_fields`) and mark
  invoices paid manually (`paid_out_of_band`) when the bank transfer arrives; or
- generate a Swiss QR-bill PDF ourselves (e.g. via a QR-bill library) from `invoice.finalized` and attach/send it;
- re-check after account activation whether Stripe offers additional methods for CH (Dashboard → Settings → Payment methods).

## Note for the UI/API parts

`tests/b2b-site.test.mjs` and `tests/fam-site.test.mjs` forbid the words stripe/checkout/paypal/twint in the public site
files (incl. `components/public/marketing.ts`). marketing.ts therefore only imports `PLANS` and has no billing wording.
The part that adds payment buttons to /preise or /familien must relax those guards deliberately (e.g. allow them only
behind the `NEXT_PUBLIC_STRIPE_ENABLED` flag) instead of working around them.
