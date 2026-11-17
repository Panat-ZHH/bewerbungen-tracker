// Payments re-audit 2 (2026-11-17): a family plan assigned by hand (admin_assign_family_plan: trial / pilot / active,
// no Stripe subscription, no Stripe customer) must not read as "another parent bought the package" and a trial must be
// upgradable from the card. Regression of the has_customer fix (20261117140000): has_customer is false for every family
// without a Stripe customer, and the card showed the other-parent note for manual plans too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { familyManageMode, readBillingStatus, billingPhase, hasSubscription } = await import("../components/billing/logic.ts");
const { FAMILY_COPY } = await import("../lib/family-copy.ts");

const status = (o) => readBillingStatus({ enabled: true, plan: "family", ...o });

test("manual trial / pilot / active family plans are 'manual', never 'other-parent'", () => {
  for (const s of ["trial", "pilot", "active", "paused"]) {
    const st = status({ status: s, source: "manual", hasCustomer: false });
    assert.equal(familyManageMode(st), "manual", s);
    assert.equal(hasSubscription(st), false, `${s}: no Stripe subscription => buyable`);
  }
  assert.equal(billingPhase(status({ status: "trial", source: "manual", hasCustomer: false })), "trialing");
  // Older payloads without a source but with a licence status are manual as well.
  assert.equal(familyManageMode(status({ status: "trial", hasCustomer: false })), "manual");
});

test("Stripe plans: other-parent only when the caller can't reach the customer; portal otherwise", () => {
  assert.equal(familyManageMode(status({ status: "active", source: "stripe", subscriptionStatus: "active", hasCustomer: false })), "other-parent");
  assert.equal(familyManageMode(status({ status: "active", source: "stripe", subscriptionStatus: "active", hasCustomer: true })), "portal");
  assert.equal(familyManageMode(status({ status: "active", source: "stripe", subscriptionStatus: "active" })), "portal", "unknown => button stays");
  assert.equal(familyManageMode(status({ status: "active", source: "stripe", hasCustomer: false })), "other-parent", "stripe licence without sub row");
});

test("the family card renders the manual branch (note + buy for trials) before the other-parent / portal branch", () => {
  const src = readFileSync(new URL("../components/billing/billing-card.tsx", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function FamilyPlanBody"));
  const manual = body.indexOf('manage === "manual"');
  assert.ok(manual > 0 && manual < body.indexOf('manage === "other-parent"'));
  assert.match(body, /data-billing-manage="manual"[\s\S]*FAMILY_COPY\.manage\.manual[\s\S]*p === "trialing"[\s\S]*<FamilyChoose/);
  assert.ok(FAMILY_COPY.manage.manual && FAMILY_COPY.manage.buyNow);
  assert.doesNotMatch(FAMILY_COPY.manage.manual, /Elternteil/);
});
