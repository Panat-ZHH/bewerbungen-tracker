// Access model: /abo (Einzelabo / Familienpaket), settings + delete dialog, pricing copy (SPEC §2, §4, §8; FLOW G4 G15 G19 G22).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { loadLib } from "./helpers/load-lib.mjs";

const gate = await loadLib("access/gate");
// loadLib registered the "@/" alias hooks above, so components/billing/abo-logic.ts resolves its imports too.
const { aboMode, paysTwice } = await import("../components/billing/abo-logic.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const base = { ...gate.OPEN_ACCESS, enforced: true };
const solo = (o = {}) => ({ plan: "solo", status: "active", interval: "month", current_period_end: "2026-12-17T00:00:00Z", cancel_at_period_end: false, ...o });

test("/abo per role: student both plans, parent family only, staff none, school licence no prices", () => {
  assert.equal(aboMode(null), "loading");
  assert.equal(aboMode({ ...base, state: "trial", reason: "trial", account_type: "independent_student" }), "student");
  assert.equal(aboMode({ ...base, has_access: false, state: "expired" }), "student");
  assert.equal(aboMode({ ...base, account_type: "parent", state: "trial", reason: "trial" }), "parent");
  assert.equal(aboMode({ ...base, role: "teacher", state: "licence_required", has_access: false }), "staff");
  assert.equal(aboMode({ ...base, role: "school_admin" }), "staff");
  assert.equal(aboMode({ ...base, reason: "school_licence" }), "licensed");
  assert.equal(aboMode({ ...base, family_pending: true, has_access: false, state: "expired", expired_reason: "family_pending" }), "family_pending");
  assert.equal(aboMode({ ...base, reason: "family_subscription" }), "family_covered");
  assert.equal(aboMode({ ...base, reason: "subscription", subscription: solo() }), "solo_active");
  assert.equal(aboMode({ ...base, reason: "subscription", subscription: solo({ status: "canceled" }), has_access: false, state: "expired" }), "student", "ended solo: buy again");
});

test("G15: own Einzelabo + school / family coverage → 'Einzelabo kündigen' notice", () => {
  assert.equal(paysTwice({ ...base, reason: "school_licence", subscription: solo() }), true);
  assert.equal(paysTwice({ ...base, reason: "family_subscription", subscription: solo() }), true);
  assert.equal(paysTwice({ ...base, reason: "family_subscription", subscription: solo({ cancel_at_period_end: true }) }), false);
  assert.equal(paysTwice({ ...base, reason: "subscription", subscription: solo() }), false);
  assert.match(read("components/billing/abo-view.tsx"), /abo-pays-twice/);
});

test("solo checkout uses the backend contract: plan solo, interval, owner me, card; portal owner me", async () => {
  const s = read("components/billing/solo.ts");
  assert.match(s, /plan: "solo", interval, payment: "card", owner: "me"/);
  assert.match(s, /\/api\/billing\/portal[\s\S]*owner: "me"/);
  assert.match(s, /solo_parent_use_family/);
  assert.match(s, /soloPlan\(\)/, "prices from lib/billing/plans.ts (PLANS.solo) with the fallback");
  const { PLANS } = await import("../lib/billing/plans.ts");
  assert.equal(PLANS.solo.priceChfPerMonth, 4.9);
  assert.equal(PLANS.solo.priceChfPerYear, 49);
  const v = read("components/billing/abo-view.tsx");
  for (const id of ["abo-page", "abo-plan-solo", "abo-plan-family", "abo-licensed", "abo-staff"]) assert.match(v, new RegExp(`data-testid="${id}"`), id);
  assert.match(v, /billing/); // ?billing=success|cancel|portal return handling
});

test("G4: delete dialog links to the subscription when a running Einzelabo / family / school sub blocks deletion", () => {
  const d = read("components/settings/delete-account.tsx");
  assert.match(d, /SUBSCRIPTION_ACTIVE[\s\S]*Einzelabo[\s\S]*"\/abo"/);
  assert.match(d, /delete-manage-abo/);
  const r = read("app/api/account/delete/route.ts");
  assert.match(r, /b\.kind === "solo"/);
  assert.match(read("lib/account-delete-server.ts"), /"family" \| "school" \| "solo"/);
});

test("settings shows the Abo section (hidden for school licence / staff)", () => {
  assert.match(read("app/settings/page.tsx"), /<AboSection \/>/);
  assert.match(read("components/settings/abo-section.tsx"), /hidesPrices\(access\) \|\| isStaff\(access\)/);
});

test("G22: in-app checkout off is no dead end", () => {
  assert.match(read("components/billing/in-app-checkout.tsx"), /in-app-off[\s\S]*\/familie#abo/);
});

test("G19 copy: 7-day trial + Einzelabo + Familienpaket; no 'free for students' claims outside the school-licence context", () => {
  const preise = read("app/preise/page.tsx");
  assert.match(preise, /7 Tage gratis testen/);
  assert.match(preise, /CHF 4\.90/);
  assert.match(preise, /CHF 49 pro Jahr/);
  assert.match(preise, /data-family-price/);
  assert.doesNotMatch(preise, /Für Schüler kostenlos/);
  const claims = [
    ["app/page.tsx", /kostenlos für Schülerinnen und Schüler|Kostenlos für dich/],
    ["app/hilfe/page.tsx", /Nein\. Für Schülerinnen und Schüler ist WendApply kostenlos/],
    ["app/anleitung/page.tsx", /Kostenlos für Schülerinnen und Schüler/],
    ["app/login/page.tsx", /Gratis für Schüler/],
    ["components/guide/content.tsx", /Für Schülerinnen und Schüler ist WendApply kostenlos/],
    ["lib/family-copy.ts", /Für (dich|dein Kind) bleibt WendApply kostenlos/],
    ["lib/family-core.ts", /bleibt WendApply kostenlos/],
    ["lib/seo/pages.ts", /Für Schüler kostenlos/],
    ["lib/seo/offer.ts", /während der Lancierung/],
    ["components/billing/logic.ts", /aktuell kostenlos/],
  ];
  for (const [file, re] of claims) assert.doesNotMatch(read(file), re, file);
  assert.match(read("lib/seo/offer.ts"), /7 Tage kostenlos testen/);
});

test("no 30-day family trial any more", () => {
  assert.match(read("components/family/plan-card.tsx"), /const ACCESS_STATES = \["pilot", "active"\]/);
  assert.doesNotMatch(read("lib/family-core.ts"), /Tage Testphase/);
});

test("Swiss spelling in the new files (no sharp s)", () => {
  for (const f of ["components/billing/abo-view.tsx", "components/billing/solo.ts", "components/settings/abo-section.tsx", "components/access/access-pages.tsx", "components/access/access-banner.tsx", "components/access/school-licence-view.tsx", "components/onboarding/class-code-step.tsx", "app/preise/page.tsx"]) {
    assert.doesNotMatch(read(f), /ß/, f);
  }
});

test("Einzelabo pays in the app: Payment Element on /abo when the publishable key is set, hosted page only as fallback", () => {
  const v = read("components/billing/abo-view.tsx");
  assert.match(v, /if \(inAppPaymentEnabled\(\)\) \{[^}]*setPayInApp\(true\)/, "buy() opens the in-app form first");
  assert.match(v, /<SoloPayForm interval=\{period\}/);
  const s = read("components/billing/solo.ts");
  assert.match(s, /startSoloInAppCheckout[\s\S]*plan: "solo"[\s\S]*owner: "me", ui: "elements"/, "in-app session asks for ui 'elements'");
  assert.match(s, /\/abo\?billing=success&session_id=/, "after paying back to /abo?billing=success (AboView polls my_access)");
  const f = read("components/billing/solo-pay-form.tsx");
  assert.match(f, /createPaymentElement/);
  assert.match(f, /confirm\(\{ redirect: "if_required" \}\)/, "no returnUrl passed to confirm() (it hangs)");
  assert.doesNotMatch(f, /checkout\.stripe\.com|window\.location\.assign\(r\.data\.url\)/, "never the hosted page");
});
