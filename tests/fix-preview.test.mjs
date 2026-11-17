// Fixes for the preview end-to-end run (_launch/PREVIEW-E2E.md, bugs B1-B4).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { shouldPollRequests } from "../lib/friend-badge.ts";
import { familyBuyTarget, inAppPaymentEnabled, readPayParams } from "../components/billing/logic.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("B3: friend-request badge never polls social_list without a session", () => {
  assert.equal(shouldPollRequests(true, false), false);
  assert.equal(shouldPollRequests(false, true), false);
  assert.equal(shouldPollRequests(false, false), false);
  assert.equal(shouldPollRequests(true, true), true);
  const ctx = src("components/friends/friend-requests-context.tsx");
  assert.match(ctx, /supabase\.auth\.getSession\(\)/);
  assert.match(ctx, /onAuthStateChange/);
  assert.match(ctx, /const active = shouldPollRequests\(enabled, signedIn\)/);
  // both the start/route fetch and the 30 s poll are gated by the session, not only by `enabled`
  assert.equal((ctx.match(/if \(!active\) return;/g) ?? []).length, 2);
  assert.doesNotMatch(ctx, /\}, \[enabled, pathname, refresh\]\)/);
});

const FAMILY = "00000000-0000-4000-8000-000000003002";

test("B1: family buy button goes to the in-app page when the Payment Element is on, hosted Checkout otherwise", () => {
  const year = familyBuyTarget(FAMILY, "year", true);
  assert.equal(year.kind, "in-app");
  assert.ok(year.href.startsWith("/familie/bezahlen?"));
  assert.deepEqual(readPayParams(year.href.split("?")[1]), { familyId: FAMILY, interval: "year" });
  const month = familyBuyTarget(FAMILY, "month", true);
  assert.deepEqual(readPayParams(month.href.split("?")[1]), { familyId: FAMILY, interval: "month" });
  assert.deepEqual(familyBuyTarget(FAMILY, "year", false), { kind: "hosted" });
  assert.deepEqual(familyBuyTarget(FAMILY, "month", false), { kind: "hosted" });
  // the inputs that decide it: flag on + pk_test_/pk_live_ + not forced to hosted
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "pk_test_abc", ui: undefined }), true);
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "pk_test_abc", ui: "hosted" }), false);
  assert.equal(inAppPaymentEnabled({ enabled: true, publishableKey: "", ui: undefined }), false);
  assert.equal(inAppPaymentEnabled({ enabled: false, publishableKey: "pk_live_abc", ui: undefined }), false);
});

test("B1: FamilyChoose.buy uses the decision before hosted Checkout (fallback kept), manual-plan trial upgrade still uses FamilyChoose", () => {
  const card = src("components/billing/billing-card.tsx");
  const start = card.indexOf("function FamilyChoose(");
  const end = card.indexOf("export function FamilyPlanBody");
  assert.ok(start > 0 && end > start);
  const body = card.slice(start, end);
  const decide = body.indexOf("familyBuyTarget(familyId, billing.interval)");
  const push = body.indexOf("router.push(target.href)");
  const hosted = body.indexOf('startCheckout({ kind: "family", id: familyId }, plan.id, "card", billing.interval)');
  assert.ok(decide > 0 && push > decide && hosted > push, "in-app decision first, hosted Checkout as fallback");
  assert.match(body, /window\.location\.assign\(r\.data\.url\)/);
  assert.match(card, /data-billing-manage="manual"/);
  assert.match(card, /p === "trialing" && \(rebuy \|\| open \? <FamilyChoose/);
});
