// lib/access/core.ts (pure decision mirror + my_access parser), lib/access/server.ts (API helper) and the paywall in the
// ai-review edge function handler. The SQL truth is tested in access-core-db.test.mjs (which also checks parity with this mirror).
import { test } from "node:test";
import assert from "node:assert/strict";

const core = await import("../lib/access/core.ts");
const { decideAccess, parseAccessInfo, subState, graceUntil, intervalOf, trialDaysLeft, isPaywallError, isMissingFunction, FULL_ACCESS } = core;

const NOW = new Date("2026-12-01T12:00:00Z");
const d = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();
const base = (over = {}) => ({
  now: NOW, mode: "on", enforceTest: false, blockedAt: null, grantUntil: null, trialEndsAt: d(3), role: "student",
  accountType: "independent_student", licensedSchool: null, licenceEnded: false, solo: null, family: null, ...over,
});
const sub = (over = {}) => ({ plan: "solo", status: "active", current_period_start: d(-10), current_period_end: d(20), cancel_at_period_end: false, ...over });

test("trial → trial with days left; expired → paywall with trial_ended", () => {
  let a = decideAccess(base());
  assert.deepEqual([a.has_access, a.state, a.reason, a.trial_days_left, a.expired_reason], [true, "trial", "trial", 3, null]);
  a = decideAccess(base({ trialEndsAt: d(-1) }));
  assert.deepEqual([a.has_access, a.state, a.reason, a.trial_days_left, a.expired_reason], [false, "expired", "none", 0, "trial_ended"]);
});

test("enforcement modes: off and test_users (without enforce_test) never lock out", () => {
  for (const [mode, enforceTest, has, enforced] of [["off", false, true, false], ["test_users", false, true, false], ["test_users", true, false, true], ["on", false, false, true]]) {
    const a = decideAccess(base({ mode, enforceTest, trialEndsAt: d(-1) }));
    assert.deepEqual([a.has_access, a.enforced, a.state], [has, enforced, "expired"], `${mode}/${enforceTest}`);
  }
});

test("blocked beats everything except mode off", () => {
  for (const mode of ["test_users", "on"]) {
    const a = decideAccess(base({ mode, blockedAt: d(-1), grantUntil: d(10), solo: sub() }));
    assert.deepEqual([a.has_access, a.state, a.blocked, a.enforced], [false, "blocked", true, true]);
  }
  assert.equal(decideAccess(base({ mode: "off", blockedAt: d(-1), trialEndsAt: d(-1) })).has_access, true);
});

test("order: grant > school licence > solo > family > grace > licence_required > trial", () => {
  const school = { id: "s1", name: "Sek", valid_until: "2027-07-31" };
  assert.equal(decideAccess(base({ grantUntil: d(1), licensedSchool: school })).reason, "grant");
  const s = decideAccess(base({ licensedSchool: school, solo: sub() }));
  assert.deepEqual([s.reason, s.trial_ends_at, s.trial_days_left, s.school], ["school_licence", null, null, school]);
  assert.equal(decideAccess(base({ solo: sub(), family: { role: "child", sub: sub({ plan: "family" }), adminPlan: false } })).reason, "subscription");
  assert.equal(decideAccess(base({ trialEndsAt: d(-1), family: { role: "child", sub: sub({ plan: "family" }), adminPlan: false } })).reason, "family_subscription");
  assert.equal(decideAccess(base({ trialEndsAt: d(-1), family: { role: "parent", sub: null, adminPlan: true } })).reason, "family_subscription");
  const g = decideAccess(base({ solo: sub({ status: "past_due", current_period_start: d(-2), current_period_end: d(28) }) }));
  assert.deepEqual([g.state, g.reason, g.grace_until], ["grace", "grace", d(5)]);
});

test("teachers / school admins: no trial, licence_required, school licence or grant opens", () => {
  for (const role of ["teacher", "school_admin"]) {
    const a = decideAccess(base({ role, accountType: null }));
    assert.deepEqual([a.has_access, a.state, a.trial_ends_at, a.trial_days_left, a.account_type, a.expired_reason], [false, "licence_required", null, null, null, null]);
    assert.equal(decideAccess(base({ role, licenceEnded: true })).expired_reason, "licence_ended");
    assert.equal(decideAccess(base({ role, licensedSchool: { id: "s", name: "S", valid_until: null } })).has_access, true);
    assert.equal(decideAccess(base({ role, grantUntil: d(1) })).reason, "grant");
  }
});

test("subscription states: canceled/unpaid/incomplete_expired/paused/incomplete none; stale active none; cancel_at_period_end active", () => {
  for (const status of ["canceled", "unpaid", "incomplete_expired", "paused", "incomplete"]) assert.equal(subState(sub({ status }), NOW), "none", status);
  assert.equal(subState(sub({ cancel_at_period_end: true }), NOW), "active");
  assert.equal(subState(sub({ current_period_end: d(-3) }), NOW), "none");
  assert.equal(subState(sub({ current_period_end: d(-1) }), NOW), "active"); // webhook lag tolerance (2 days)
  assert.equal(subState(sub({ status: "trialing" }), NOW), "active");
  assert.equal(subState(sub({ status: "past_due", current_period_start: d(-8) }), NOW), "none");
  assert.equal(graceUntil(sub()), null);
  assert.equal(intervalOf(sub()), "month");
  assert.equal(intervalOf(sub({ current_period_end: d(355) })), "year");
  assert.equal(intervalOf(sub({ current_period_start: null })), null);
  assert.equal(trialDaysLeft(null, NOW), null);
  assert.equal(trialDaysLeft(d(0.2), NOW), 1);
});

test("expired_reason + family_pending", () => {
  assert.equal(decideAccess(base({ trialEndsAt: d(-1), solo: sub({ status: "canceled" }) })).expired_reason, "subscription_ended");
  assert.equal(decideAccess(base({ trialEndsAt: d(-1), solo: sub({ status: "unpaid" }) })).expired_reason, "payment_failed");
  assert.equal(decideAccess(base({ trialEndsAt: d(-1), licenceEnded: true })).expired_reason, "licence_ended");
  const c = decideAccess(base({ trialEndsAt: d(-1), family: { role: "child", sub: null, adminPlan: false } }));
  assert.deepEqual([c.expired_reason, c.family_pending], ["family_pending", true]);
  const p = decideAccess(base({ trialEndsAt: d(-1), accountType: "parent", role: "parent", family: { role: "parent", sub: null, adminPlan: false } }));
  assert.deepEqual([p.expired_reason, p.family_pending], ["trial_ended", false]);
});

test("parseAccessInfo: accepts the RPC shape, rejects junk, defaults newer keys", () => {
  const raw = { ...decideAccess(base({ solo: sub() })), extra: 1 };
  const json = JSON.parse(JSON.stringify(raw));
  const parsed = parseAccessInfo(json);
  assert.equal(parsed.reason, "subscription");
  assert.equal(parsed.subscription.plan, "solo");
  assert.equal("extra" in parsed, false);
  for (const junk of [null, 1, "x", [], {}, { has_access: "yes", state: "trial", reason: "trial", role: "student" }, { has_access: true, state: "weird", reason: "trial", role: "student" }]) {
    assert.equal(parseAccessInfo(junk), null, JSON.stringify(junk));
  }
  const old = parseAccessInfo({ has_access: true, state: "trial", reason: "trial", role: "student", trial_days_left: 6.7, subscription: { plan: "gold" } });
  assert.deepEqual([old.expired_reason, old.family_pending, old.enforced, old.trial_days_left, old.subscription], [null, false, false, 6, null]);
  assert.equal(FULL_ACCESS.has_access, true);
  assert.equal(FULL_ACCESS.enforced, false);
});

test("isPaywallError / isMissingFunction", () => {
  assert.equal(isPaywallError({ code: "P0001", message: "PAYWALL" }), true);
  assert.equal(isPaywallError({ error: "paywall" }), true);
  assert.equal(isPaywallError({ code: "P0001", message: "FORBIDDEN" }), false);
  assert.equal(isPaywallError(null), false);
  assert.equal(isMissingFunction({ code: "PGRST202" }), true);
  assert.equal(isMissingFunction({ code: "42883" }), true);
  assert.equal(isMissingFunction({ code: "P0001" }), false);
});

test("lib/access/server: hasAppAccessVia + paywallResponse", async () => {
  const { hasAppAccessVia, paywallResponse, PAYWALL_STATUS } = await import("../lib/access/server.ts");
  const calls = [];
  const client = (answer) => ({ rpc: async (name, args) => { calls.push([name, args]); return answer; } });
  assert.equal(await hasAppAccessVia(client({ data: false, error: null })), false);
  assert.equal(await hasAppAccessVia(client({ data: true, error: null }), "u1"), true);
  assert.deepEqual(calls.at(-1), ["has_app_access", { p_uid: "u1" }]);
  assert.equal(await hasAppAccessVia(client({ data: null, error: { code: "PGRST202" } })), true);
  assert.equal(await hasAppAccessVia({ rpc: async () => { throw new Error("down"); } }), true);
  const res = paywallResponse();
  assert.equal(res.status, PAYWALL_STATUS);
  assert.equal(res.status, 402);
  assert.equal((await res.json()).error, "paywall");
});

test("ai-review handler: paywall → 402 before consent/limits/insert; lookup failure → 503; allowed passes on", async () => {
  const { createHandler } = await import("../supabase/functions/ai-review/handler.ts");
  const { memoryRateLimitRpc } = await import("../supabase/functions/_shared/rate-limit-core.ts");
  const run = async (hasAccess) => {
    const state = { consent: 0, inserted: 0 };
    const handler = createHandler({
      env: () => undefined, verifyUser: async () => ({ id: "00000000-0000-4000-8000-0000000000a1" }),
      saveConsent: async () => { state.consent++; }, getDailyLimit: async () => null, rateLimit: memoryRateLimitRpc(),
      insertReview: async () => { state.inserted++; return { id: "r", created_at: "2026-12-01T00:00:00Z" }; },
      extract: { unzip: () => ({}), pdfText: async () => "" }, hasAccess,
    });
    const fd = new FormData(); fd.set("consent", "true"); fd.set("file", new Blob(["x"]), "a.pdf");
    const res = await handler(new Request("http://x/functions/v1/ai-review", { method: "POST", headers: { Authorization: "Bearer t" }, body: fd }));
    return { status: res.status, body: await res.json(), state };
  };
  const denied = await run(async () => false);
  assert.equal(denied.status, 402);
  assert.equal(denied.body.error, "paywall");
  assert.match(denied.body.message, /Testwoche/);
  assert.deepEqual(denied.state, { consent: 0, inserted: 0 });
  const broken = await run(async () => { throw new Error("db"); });
  assert.equal(broken.status, 503);
  const allowed = await run(async () => true);
  assert.notEqual(allowed.status, 402); // continues (fails later on the fake file, not on access)
  const { parseAiReviewError } = await import("../lib/ai-review-core.ts");
  assert.equal(parseAiReviewError(402, { error: "paywall" }).code, "paywall");
  assert.equal(parseAiReviewError(402, {}).code, "paywall");
});

test("API routes call the access check (job search, push subscribe) and the digest skips paywalled users", async () => {
  const { readFile } = await import("node:fs/promises");
  const js = await readFile(new URL("../app/api/job-search/route.ts", import.meta.url), "utf8");
  assert.match(js, /hasAppAccess\(token\)\)\) return paywallResponse/);
  const push = await readFile(new URL("../app/api/reminders/push/route.ts", import.meta.url), "utf8");
  const post = push.slice(push.indexOf("export async function POST"), push.indexOf("export async function DELETE"));
  assert.match(post, /hasAppAccessVia\(ctx\.client\)/);
  assert.doesNotMatch(push.slice(push.indexOf("export async function DELETE")), /hasAppAccess/);
  const digest = await readFile(new URL("../lib/reminders-server.ts", import.meta.url), "utf8");
  assert.match(digest, /hasAppAccessVia\(admin, row\.user_id\)/);
});

test("scripts/admin/add-admin.mjs: finds the user by e-mail, upserts platform_admins, writes the audit log, prints no secrets", async () => {
  const { parseArgs, run, maskEmail } = await import("../scripts/admin/add-admin.mjs");
  assert.deepEqual(parseArgs([" Panat@Example.CH ", "--note", "owner"]), { email: "panat@example.ch", note: "owner", remove: false });
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(["not-an-email"]));
  assert.equal(maskEmail("panat@example.ch"), "p****@example.ch");
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    if (url.includes("/auth/v1/admin/users")) return Response.json({ users: [{ id: "u-1", email: "Panat@Example.ch" }, { id: "u-2", email: "x@y.z" }] });
    return new Response(null, { status: 201 });
  };
  const r = await run({ url: "https://ref.supabase.co", key: "service-key", args: parseArgs(["panat@example.ch"]), fetchFn });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.message, /service-key|u-1|panat@/);
  assert.equal(calls[1].url, "https://ref.supabase.co/rest/v1/platform_admins?on_conflict=user_id");
  assert.deepEqual(calls[1].body.user_id, "u-1");
  assert.equal(calls[2].body.action, "platform_admin_added");
  const missing = await run({ url: "https://ref.supabase.co", key: "service-key", args: parseArgs(["nobody@example.ch"]), fetchFn });
  assert.equal(missing.ok, false);
  const removed = await run({ url: "https://ref.supabase.co", key: "service-key", args: parseArgs(["panat@example.ch", "--remove"]), fetchFn });
  assert.equal(removed.ok, true);
  assert.equal(calls.at(-2).method, "DELETE");
  await assert.rejects(run({ url: "", key: "", args: parseArgs(["a@b.ch"]), fetchFn }));
  await assert.rejects(run({ url: "https://x", key: "sb_publishable_abc", args: parseArgs(["a@b.ch"]), fetchFn }));
});
