# WendApply – live E2E run: family onboarding + payment (Stripe TEST MODE)

Date: 2026-11-16 · Target: https://stripe-preview--bewerbungen-pawat.netlify.app (Netlify draft alias, context `deploy-preview`, billing flags ON)
Branch: `feature/stripe` (final run on 23f9a6c) · Spec: `../BILLING-FLOW-SPEC.md` §6 · Script: `scripts/billing-live-flow-e2e.mjs`
Screenshots: `docs/billing/screenshots/flow-2026-11-16/` (36 steps + `results.json`)

**Result: 43/43 live checks PASS** (final run, after 2 fixes). The first run had 36/41: 2 real bugs, plus 3 problems in the test script itself.

Everything here is real. Real Supabase (bhwreehwirrloxagyypi), real Stripe sandbox Checkout and customer portal, and the real webhook on the preview. Nothing is mocked. The test accounts were created through the `/login` signup form and confirmed through the Supabase admin API, because confirmation e-mails don't arrive for `@example.com`. Stripe ran in test mode (`livemode:false` was checked before the run).

## Bugs found and fixed (commit 23f9a6c)

| # | Bug | Impact | Fix |
|---|---|---|---|
| B1 | **Cancelling in the Stripe portal was ignored by the app.** With API version `2026-10-28`, a portal cancellation sets `cancel_at` (= period end) and leaves `cancel_at_period_end=false`. The webhook only read `cancel_at_period_end`. | After "Abo kündigen" the parent still saw **"Aktiv · Verlängert sich am …"** and "Abo verwalten" (run 1, AC-P12 FAIL). The DB row kept `cancel_at_period_end=false`. | `lib/billing/webhook.ts`: `cancel_at` on a subscription that hasn't ended counts as canceling. Unit test in `tests/billing-webhook.test.mjs`. Run 2: "Gekündigt · läuft noch bis 16.11.2027", "Abo verlängern". |
| B2 | **Every cancelled or declined Checkout left an orphan Stripe customer.** `billing_customers` was only written by the webhook after a payment, so each new checkout attempt created another customer. | Run 1: 2 Stripe customers for 1 family. That means duplicate customers or receipts later, and a messy dashboard. | `lib/billing/api.ts` + `server.ts`: `saveCustomer()` writes the new customer at once (service role, upsert, best effort, never blocks checkout). Unit test in `tests/billing-api.test.mjs`. Run 2: 1 customer after cancel + decline + pay. |

Checks after the fixes: `eslint` 0 errors, `tsc --noEmit` clean, `npm test` 637/637, `netlify deploy --build --context deploy-preview --alias stripe-preview` OK (draft, **not** prod).

## Live flow, step by step (final run)

| Step | Check | Result | Screenshot |
|---|---|---|---|
| F1 | Parent signup via `/login` (role Elternteil) → "Fast geschafft" → confirmed via admin API | PASS | 01, 02 |
| F2 | Parent login lands on `/familie` (no student tour) | PASS | 03 |
| F1 | Student signup (Schüler:in privat, Jahrgang 2012 = under 16) → confirmed | PASS | 04, 05 |
| F3 | Student login → `/onboarding` | PASS | 06 |
| AC-S7 | Tour step "Fertig" shows "Eltern verbinden (freiwillig)", which opens `/familie` | PASS | 07, 08 |
| AC-P1 | Parent start: stepper, step `family`=current, no price or buy button | PASS | 09 |
| AC-P2 | Create with an empty name → "Familie «Meine Familie» erstellt", primary "Code für mein Kind erstellen" | PASS | 10 |
| AC-P3 | Code + "Gültig bis" + waiting text. The same code is shown after a reload | PASS | 11 |
| AC-S1 | Student start: `connect`, primary "Link für meine Eltern erstellen", no price | PASS | 12 |
| F5 | Student enters the parent's code → joins the family (`child` view) | PASS | 13, 14 |
| AC-S4 | Student, no plan: "Das Familienpaket bucht ein Elternteil …", no badge | PASS | 14 |
| AC-P4 | Parent page picks up the child **without a reload** (about 10 s) | PASS | 15 |
| AC-P5 | Under 16 → step `child`=attention, "Zustimmung geben" → modal → step `plan`=current | PASS | 15, 16, 17 |
| AC-P6 | Yearly preselected, "Spare CHF 15.80", button "Familienpaket buchen · CHF 79 pro Jahr" (desktop light + mobile dark) | PASS | 17, 18 |
| F6 | Stripe Checkout opens: "WendApply Familienpaket", 79,00 CHF pro Jahr, Sandbox | PASS | 19 |
| AC-P8 | Back arrow on Checkout → "Bezahlung abgebrochen", URL cleaned, step 3 still current | PASS | 20 |
| F7 | Declined card 4000 0000 0000 0002 → "Ihre Kreditkarte wurde abgelehnt", stays on Checkout | PASS | 21 |
| F8 | 4242 4242 4242 4242, 12/34, 123 → back to `/familie?billing=success` | PASS | 22 |
| AC-P9 | "Danke! Wir schalten …" (activating) → active after about 3 s (webhook). **Buy button never visible.** Stepper "Alles eingerichtet", "Abo verwalten" | PASS | 23, 24, 25 |
| F9 | DB: `school_licences` family row `active`. Stripe: exactly 1 active subscription | PASS | – |
| AC-S4 | Student sees "Familienpaket aktiv" (desktop + mobile dark) | PASS | 26, 27 |
| F10 | "Abo & Rechnung" → "Abo verwalten" opens the Stripe customer portal | PASS | 28, 29 |
| F11 | Portal: "Abonnement kündigen" → confirm → Stripe `cancel_at`=2027-11-16 | PASS | 30, 31 |
| AC-P12 | Back to `/familie?billing=portal` → notice + badge "Gekündigt", "läuft noch bis 16.11.2027", "Abo verlängern", no buy button | PASS (after B1 fix) | 32, 33 |
| AC-S4 | Student after cancel: neutral text, no payment wording (S8) | PASS | 34 |
| – | `/preise`, `/familien` with the flag on | PASS (AC-G1) | 35, 36 |

### Global criteria (all screenshots of app pages)

| AC | Check | Result |
|---|---|---|
| AC-G1 | "Bald verfügbar", "Zugang anfragen", "Warteliste", "noch nicht freigeschaltet", "Online-Bezahlung folgt" **never** rendered (`/familie` both roles in every state, `/preise`, `/familien`, login, onboarding) | PASS |
| AC-G3 | Never more than 1 `[data-primary-action]` on `/familie` | PASS (see note 1) |
| AC-G4 | No `ß` in any rendered app text | PASS |
| AC-S5 | The student never calls `/api/billing/*` (network log) | PASS |
| – | No console errors on app pages | PASS |

## Not covered by this live run
These states can't be reached with real money flows in one session, or need special set-ups. They are covered by the builders' **mocked** Playwright scripts (`family-parent-flow-e2e.mjs`, `family-student-flow-e2e.mjs`, `billing-ui-e2e.mjs`) and unit tests, not re-verified live: AC-P7 (exact request body), AC-P10 (slow activation and the sessionStorage guard), AC-P11 (past_due banner), AC-P13 (ended → re-buy), AC-P14 (status API error/503), AC-P15/AC-S8 (invite-link signup with `?fuer=`), AC-P16/AC-S9 (empty-family switch), AC-P18 (`/preise` deep links when logged out), AC-S2 (student link), AC-S3 (birth-year gate), AC-S6 (nav for school students), AC-G2 (flag off).
AC-P17 (seat full) was seen live in passing: "In eurer Familie ist schon ein Kind verbunden … Zur Kontaktseite" with no "Zugang anfragen" (screenshot 32).

## Notes and small findings (not fixed, for the product backlog)
1. **AC-G3 wording vs design:** the spec says "exactly 1 primary on every state". But its own design has states with no primary action: the waiting-for-child code, the activating/active/canceling states (where "Abo verwalten" is secondary by spec), and the student child view. The live check enforces "never more than 1". The screens with 0 primaries are listed in `results.json` (AC-G3b). This is a spec clarification, not a bug.
2. **Portal-return notice repeats the word:** "Familienpaket: Gekündigt" / "Gekündigt. Das Familienpaket läuft noch bis …" (screenshot 32). Copy nit.
3. **Parent display name = e-mail local part** ("Eltern in dieser Familie: wendapply-e2e-parent-…"), because parents have no name step. Consider asking for a first name at parent signup.
4. **Mobile full-page screenshots** show the fixed bottom nav over the buy button (18). This is a full-page capture artifact, and on a real phone the button scrolls free. Still worth a quick manual look that the sticky nav never covers the CTA at its rest position.
5. **Stripe-hosted pages use `ß`** ("gemäß", "abgerechnet") and German-German wording. This is Stripe's own locale and outside the app. If it matters, set the Checkout/portal locale to `de-CH`, if Stripe offers it, or accept it.
6. **No receipt e-mails in test mode** (the spec's P22 is expected).
7. `.env.local`'s Stripe CLI token had expired. The script uses the logged-in `stripe` CLI (sandbox) instead. `scripts/billing-stripe-e2e.mjs` needs a fresh key/token to run again.

## Cleanup (done)
Both runs: the test users (`wendapply-e2e-parent/student-<ts>@example.com`) were deleted via the admin API, and the family, `billing_customers`, `billing_subscriptions` and `school_licences` rows were deleted. The Stripe test subscriptions were cancelled and the test customers deleted (`deleted:true` verified; the Stripe search index lags a few minutes). No secrets were printed or written to disk, nothing was pushed, and there was no `--prod` deploy.

## Re-run
```bash
PLAYWRIGHT=<playwright-core/index.mjs> CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node scripts/billing-live-flow-e2e.mjs          # cleans up its own test data at the end (KEEP=1 to keep it)
PHASE=cleanup node scripts/billing-live-flow-e2e.mjs   # cleanup only, from /tmp/wendapply-live-e2e-state.json
```
Needs: `~/JARVIS/bin/sb privat` (Supabase service key is fetched at runtime, never printed) and a logged-in `stripe` CLI on the Wendapply Sandbox.
