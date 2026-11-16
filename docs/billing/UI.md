# Billing UI (part stripe-ui)

All payment UI lives in `components/billing/`; pages only mount it. Prices always come from `lib/billing/plans.ts`
(shown "exkl. MWST"). Swiss spelling (ss).

| File | What |
|---|---|
| `logic.ts` | pure helpers: flag (`onlinePaymentEnabled()` = `NEXT_PUBLIC_STRIPE_ENABLED === 'true'`), plans, labels, status normaliser, API error texts, `?billing=` return messages |
| `api.ts` | browser calls to `/api/billing/{status,checkout,portal}` with `Authorization: Bearer <Supabase access token>`; errors become friendly German text (503/404 = "noch nicht freigeschaltet") |
| `billing-card.tsx` | `BillingCard` ("Abo & Rechnung" per school in /schul-admin), `FamilyBilling` (purchase part of the /familie plan card), `BillingOffNotice` |
| `plan-picker.tsx` | `PlanPicker` radio cards (Starter / Professional / Enterprise) |
| `payment-choice.tsx` | `PaymentChoice` card or invoice (schools); single option = note only (families: card only) |
| `billing-return.tsx` | `BillingReturnNotice`: message for `?billing=success|cancel`, then removes the params from the URL |

## Flag OFF (default) – site behaves as before

- /preise: offer buttons ("Offerte anfragen"), family "Zugang anfragen" → /familien#warteliste, family price "Preis folgt",
  note "WendApply ist aktuell kostenlos. Online-Bezahlung folgt.", prices "exkl. MWST".
- /schul-admin: section "Abo & Rechnung" with the same note and "Kontakt aufnehmen". No buy buttons, no API calls.
- /familie: plan card keeps "Bezahlung bald verfügbar" + "Zugang anfragen" (waitlist modal) + the note.

## Flag ON

- /preise: "Online abschliessen" per school package → `/schul-admin?plan=<id>#abo` (sign-in there), offer button stays
  as secondary; family "Familienpaket buchen" → `/familie?plan=family#abo`; family price from plans.ts.
- /schul-admin "Abo & Rechnung" (id `abo` on the first school): loads `GET /api/billing/status?schoolId=`.
  No subscription → PlanPicker (`?plan=` preselects) + PaymentChoice → `POST /api/billing/checkout`
  (card: redirect to the returned URL; invoice: "Rechnung angefordert" + link to the hosted invoice if any).
  Subscription → plan, status, payment method, renewal date, hints (open invoice, past_due, cancelled) + "Abo verwalten"
  → `POST /api/billing/portal`.
- /familie plan card: parent → price + "Familienpaket buchen" (card only) or subscription + "Abo verwalten";
  child → explanation, no button, no API call; parent without family → "erst Familie erstellen".
- Return: `?billing=success` → "Danke für deine Bestellung!" (+ status reload), `?billing=cancel` → "Bezahlung abgebrochen".
- API 503/404 (server flag off or route not deployed): friendly message + "Nochmals versuchen" + contact. Never a crash.

Note: `PLANS.family` is still marked `placeholder: true`; with the flag on, its amount is shown (test mode). Before going
live, set the real family price in plans.ts (the API refuses placeholder plans in live mode).

## Tests

- `tests/billing-ui.test.mjs` (part of `npm test`): logic for both flag values + source contracts of the pages.
- `scripts/billing-ui-e2e.mjs`: headless Chrome, both flag states (spawns a dev server per state with the dummy Supabase
  env; Supabase and `/api/billing/*` are mocked, no Stripe needed). 114 checks incl. axe WCAG A/AA on the billing sections.
  `PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> node scripts/billing-ui-e2e.mjs [--flag=on|off]`
- Screenshots (written by the e2e run): `docs/billing/screenshots/` – `preise-{off,on}-*`, `schul-admin-billing-{off,on}-*`
  (+ `-on-subscribed`, `-on-api-503`), `familie-plan-{off,on}-*` (+ `-on-return-success`), desktop light and mobile dark.
