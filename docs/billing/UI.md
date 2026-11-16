# Billing UI (part stripe-ui)

All payment UI lives in `components/billing/`; pages only mount it. Prices always come from `lib/billing/plans.ts`
(final prices, no VAT wording – not MWST-registered). Swiss spelling (ss).

| File | What |
|---|---|
| `logic.ts` | pure helpers: flag (`onlinePaymentEnabled()` = `NEXT_PUBLIC_STRIPE_ENABLED === 'true'`), plans, labels, status normaliser, API error texts, `?billing=` return messages |
| `api.ts` | browser calls to `/api/billing/{status,checkout,portal}` with `Authorization: Bearer <Supabase access token>`; errors become friendly German text (503/404 = "noch nicht freigeschaltet") |
| `billing-card.tsx` | `BillingCard` ("Abo & Rechnung" per school in /schul-admin), `BillingOffNotice`; family: `useFamilyBilling` (status, phase, `?billing=` return, polling, sessionStorage guard), `FamilyPlanBody` (card body per phase), `FamilyReturnNotice` (top of /familie), `FamilyPortalButton`, `FamilyBilling` (legacy mount) |
| `interval-choice.tsx` | monthly / yearly radios (yearly preselected), optional "Spare …" badge |
| `plan-picker.tsx` | `PlanPicker` radio cards (Starter / Professional / Enterprise) |
| `payment-choice.tsx` | `PaymentChoice` card or invoice (schools); single option = note only (families: card only) |
| `billing-return.tsx` | `BillingReturnNotice`: message for `?billing=success|cancel`, then removes the params from the URL |

## Flag OFF (default) – site behaves as before

- /preise: offer buttons ("Offerte anfragen"), family "Zugang anfragen" → /familien#warteliste, family price CHF 7.90/Monat oder CHF 79/Jahr,
  note "WendApply ist aktuell kostenlos. Online-Bezahlung folgt.", prices without any VAT note.
- /schul-admin: section "Abo & Rechnung" with the same note and "Kontakt aufnehmen". No buy buttons, no API calls.
- /familie: plan card keeps "Bezahlung bald verfügbar" + "Zugang anfragen" (waitlist modal) + the note.

## Flag ON

- /preise: "Online abschliessen" per school package → `/schul-admin?plan=<id>#abo` (sign-in there), offer button stays
  as secondary; family "Monatlich buchen" / "Jährlich buchen" → `/familie?plan=family&interval=month|year#abo`; family price from plans.ts.
- /schul-admin "Abo & Rechnung" (id `abo` on the first school): loads `GET /api/billing/status?schoolId=`.
  No subscription → PlanPicker (`?plan=` preselects) + PaymentChoice → `POST /api/billing/checkout`
  (card: redirect to the returned URL; invoice: "Rechnung angefordert" + link to the hosted invoice if any).
  Subscription → plan, status, payment method, renewal date, hints (open invoice, past_due, cancelled) + "Abo verwalten"
  → `POST /api/billing/portal`.
- /preise: family "Jährlich buchen" (sun, primary) first, "Monatlich buchen" secondary. /familien: CTAs "Familienpaket buchen" →
  `/familie?plan=family&interval=year#abo`, sticker "online buchbar", waitlist section hidden.
- /familie (parent): see "Parent flow" below. Child (flag on): neutral line only, "Familienpaket aktiv" (plan state trial/pilot/active)
  or "Das Familienpaket bucht ein Elternteil. Für dich bleibt WendApply kostenlos." No prices, no payment problems, no API call (S8).
- School return: `?billing=success` → "Danke für deine Bestellung!" (+ status reload), `?billing=cancel` → "Bezahlung abgebrochen".
- API 503/404 (server flag off or route not deployed): friendly message + "Nochmals versuchen" + contact. Never a crash.

Family price (2026-11-16): CHF 7.90 per month or CHF 79 per year (no VAT), shown in both flag states.

## Parent flow on /familie (BILLING-FLOW-SPEC.md §3.1, §3.4, §3.5)

Next-best-action: `components/family/parent-steps.ts` (`parentNextAction`, pure, unit-tested). Stepper: `components/family/family-stepper.tsx`
(vertical on mobile, a row from `sm`; all done → one expandable line "Alles eingerichtet"). Exactly one `[data-primary-action]` per state.

| Step | Current when | Primary |
|---|---|---|
| 1 Familie erstellen | no family | "Familie erstellen" (name optional → "Meine Familie"); "Dein Kind hat dir schon einen Code geschickt?" collapsed. Invite link (`/familie/einladung/<CODE>`): "Einladung annehmen", "Lieber eine eigene Familie erstellen" secondary |
| 2 Kind verbinden | no connected child | "Code für mein Kind erstellen" → code + copy/share + "Wir warten auf dein Kind …" (refresh every 15 s and on focus; the open code from `family_get_my.invites` survives a reload). Child under 16 → step "attention", "Zustimmung geben". Quiet link "Paket schon jetzt buchen". Empty own family: join toggle; `ALREADY_IN_FAMILY` → switch modal → `family_leave` then `family_join` |
| 3 Familienpaket wählen (flag on only) | phase none / incomplete / ended / past_due / unpaid | "Familienpaket buchen · CHF 79 pro Jahr" (yearly preselected, "Spare CHF 15.80"; `?interval=month` overrides), "Familienpaket wieder buchen" (ended), "Karte aktualisieren" (past_due / unpaid, portal) |

Plan card (`#abo`, `data-billing-state`): badge and text come only from `billingPhase()` (none, incomplete, trialing, active, canceling,
past_due, unpaid, paused, ended, error; plus choose, choose-later, redirecting, activating, activation-slow). Canceling → "Abo verlängern",
active/trialing/paused → "Abo verwalten" (secondary) + "Kundenportal von Stripe" note. Load error → "Nochmals versuchen" + "Kontakt"
(503/404 → "Die Bezahlung ist gerade nicht erreichbar …").

Return from Stripe (notice at the top of the page, `data-billing-return`):
- `?billing=cancel` → "Bezahlung abgebrochen", step 3 stays current, the chosen interval is restored (sessionStorage `wa_checkout_interval`).
- `?billing=success` → "Danke! Wir schalten dein Familienpaket frei …" (activating), status polled every 2 s for up to 30 s, then
  `family_get_my` is reloaded → "Dein Familienpaket ist aktiv". Timeout → "Die Freischaltung dauert länger als üblich" + "Nochmals prüfen".
  The buy button is hidden the whole time and after a reload for 10 minutes (sessionStorage `wa_checkout_pending=<familyId>|<ts>`).
- `?billing=portal` (portal returnUrl, Part B) → silent reload; a notice only if the phase changed (phase before the portal is kept in
  sessionStorage `wa_portal_phase`).
- past_due / unpaid → `BillingBanner` at the top (Part B) + primary "Karte aktualisieren" in the card.

Known gap: while "activating" there is no primary action on the page (nothing to do but wait); AC-G3 treats it like loading.
Strings without a `FAMILY_COPY` key are local with `// TODO(copy)`: `STEP_TODO_TEXT` (parent-steps.ts), `LOCAL_COPY` (parent-view.tsx),
the visually hidden step states in family-stepper.tsx.

## Tests

- `tests/billing-ui.test.mjs` (part of `npm test`): logic for both flag values + source contracts of the pages.
- `scripts/billing-ui-e2e.mjs`: headless Chrome, both flag states (spawns a dev server per state with the dummy Supabase
  env; Supabase and `/api/billing/*` are mocked, no Stripe needed). 114 checks incl. axe WCAG A/AA on the billing sections.
  `PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> node scripts/billing-ui-e2e.mjs [--flag=on|off]`
- `tests/family-parent-steps.test.mjs`: `parentNextAction` for every branch (incl. flag off → 2 steps), `billingPhase` mapping,
  `readMyFamily` `plan.state` / `invites`, copy (no sharp s, no "bald verfügbar" wording, no CHF literals), primary-action markers, /familien flag.
- `scripts/family-parent-flow-e2e.mjs`: AC-P1..P18 + AC-G1/G3/G4 against a running dev server (flag on; `BASE_OFF` adds flag-off checks),
  stateful family mock, axe on the start page and `#abo`. 144 checks on 2026-11-16. Screenshots `family-parent-*.png`.
  `PLAYWRIGHT=… CHROME=… BASE=http://localhost:3410 [BASE_OFF=…] [ONLY=start,phases] [SLOW=0] node scripts/family-parent-flow-e2e.mjs`
- Screenshots (written by the e2e run): `docs/billing/screenshots/` – `preise-{off,on}-*`, `schul-admin-billing-{off,on}-*`
  (+ `-on-subscribed`, `-on-api-503`), `familie-plan-{off,on}-*` (+ `-on-return-success`), desktop light and mobile dark.
