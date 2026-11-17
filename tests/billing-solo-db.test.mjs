// Solo plan DB side (supabase/migrations/20261118030000_billing_solo.sql) on PGlite with ALL migrations replayed:
// billing_apply_user_subscription (upsert, no licence, idempotency, stale events, owner rules, deleted owner), grants
// (authenticated / anon cannot write), RLS (owner reads own solo rows only), billing_status_for_user, billing_solo_eligibility
// (role + coverage), account_billing_blockers (+ solo) and the link to app_access (reason 'subscription', paywall lifted).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb();
const { admin, as, asService, q, code, user, mode, expire, access, database } = ctx;
let n = 700;
const next = () => ++n;
const day = 86400;
const NOW = Math.floor(Date.now() / 1000);
const iso = (s) => new Date(s * 1000).toISOString();

/** Calls billing_apply_user_subscription as service_role with named args. */
async function apply(p) {
  const params = {
    p_stripe_customer_id: "cus_S1", p_stripe_subscription_id: "sub_S1", p_status: "active",
    p_current_period_start: iso(NOW - day), p_current_period_end: iso(NOW + 29 * day), p_cancel_at_period_end: false,
    p_user_id: null, p_event_id: null, p_event_type: "customer.subscription.updated", p_event_created: iso(NOW), ...p,
  };
  const keys = Object.keys(params);
  await asService();
  try {
    const [r] = await q(`select public.billing_apply_user_subscription(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => params[k]));
    return r.r;
  } finally { await ctx.reset(); }
}
const sub = async (id) => (await admin("select * from public.billing_subscriptions where stripe_subscription_id = $1", [id]))[0];

test("no overload: billing_apply_subscription stays a single function and still refuses plan 'solo'", async () => {
  const rows = await admin("select count(*)::int c from pg_proc where proname = 'billing_apply_subscription' and pronamespace = 'public'::regnamespace");
  assert.equal(rows[0].c, 1);
  const rows2 = await admin("select count(*)::int c from pg_proc where proname = 'billing_apply_user_subscription' and pronamespace = 'public'::regnamespace");
  assert.equal(rows2[0].c, 1);
  const u = await user(next());
  await asService();
  const err = await code(q(`select public.billing_apply_subscription(p_stripe_customer_id => 'cus_Org1', p_stripe_subscription_id => 'sub_Org1',
    p_plan_id => 'solo', p_status => 'active', p_current_period_end => now(), p_created_by => $1)`, [u]));
  await ctx.reset();
  assert.match(err, /INVALID_PLAN/);
});

test("apply: first event creates the customer (user_id) and the solo row, no licence; update keeps the owner", async () => {
  const u = await user(next());
  const r = await apply({ p_stripe_customer_id: "cus_A1", p_stripe_subscription_id: "sub_A1", p_user_id: u, p_event_id: "evt_A1" });
  assert.equal(r.applied, true);
  assert.equal(r.user_id, u);
  const [c] = await admin("select * from public.billing_customers where stripe_customer_id = 'cus_A1'");
  assert.deepEqual([c.user_id, c.created_by, c.school_id, c.family_id], [u, u, null, null]);
  const s = await sub("sub_A1");
  assert.deepEqual([s.plan_id, s.status, s.user_id, s.school_id, s.family_id, s.licence_id], ["solo", "active", u, null, null, null]);
  assert.equal((await admin("select count(*)::int c from public.school_licences where stripe_subscription_id = 'sub_A1'"))[0].c, 0);
  assert.ok((await admin("select processed_at from public.stripe_events where id = 'evt_A1'"))[0].processed_at);
  // later event without owner: customer known → applied; cancel at period end + latest invoice kept when not sent
  await apply({ p_stripe_customer_id: "cus_A1", p_stripe_subscription_id: "sub_A1", p_status: "active", p_cancel_at_period_end: true,
    p_latest_invoice_status: "paid", p_event_id: "evt_A2", p_event_created: iso(NOW + 10) });
  await apply({ p_stripe_customer_id: "cus_A1", p_stripe_subscription_id: "sub_A1", p_status: "past_due", p_cancel_at_period_end: true,
    p_event_id: "evt_A3", p_event_created: iso(NOW + 20) });
  const s2 = await sub("sub_A1");
  assert.deepEqual([s2.status, s2.cancel_at_period_end, s2.latest_invoice_status, s2.user_id], ["past_due", true, "paid", u]);
});

test("idempotency: a processed event is a duplicate; an older event is stale and changes nothing", async () => {
  const u = await user(next());
  await apply({ p_stripe_customer_id: "cus_B1", p_stripe_subscription_id: "sub_B1", p_user_id: u, p_event_id: "evt_B1", p_event_created: iso(NOW + 100) });
  const dup = await apply({ p_stripe_customer_id: "cus_B1", p_stripe_subscription_id: "sub_B1", p_user_id: u, p_status: "canceled", p_event_id: "evt_B1" });
  assert.deepEqual(dup, { applied: false, reason: "duplicate_event" });
  const stale = await apply({ p_stripe_customer_id: "cus_B1", p_stripe_subscription_id: "sub_B1", p_status: "canceled", p_event_id: "evt_B2", p_event_created: iso(NOW) });
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, "stale_event");
  assert.equal((await sub("sub_B1")).status, "active");
  assert.ok((await admin("select processed_at from public.stripe_events where id = 'evt_B2'"))[0].processed_at, "stale event acknowledged");
  // same input twice without event id: same state
  await apply({ p_stripe_customer_id: "cus_B1", p_stripe_subscription_id: "sub_B1", p_event_created: iso(NOW + 200) });
  await apply({ p_stripe_customer_id: "cus_B1", p_stripe_subscription_id: "sub_B1", p_event_created: iso(NOW + 200) });
  assert.equal((await admin("select count(*)::int c from public.billing_subscriptions where stripe_subscription_id = 'sub_B1'"))[0].c, 1);
});

test("ownership: owner required, mismatch, school/family customer, foreign subscription id, deleted owner", async () => {
  const u = await user(next());
  const other = await user(next());
  assert.match(await code(apply({ p_stripe_customer_id: "cus_C0", p_stripe_subscription_id: "sub_C0" })), /BILLING_OWNER_REQUIRED/);
  await apply({ p_stripe_customer_id: "cus_C1", p_stripe_subscription_id: "sub_C1", p_user_id: u });
  // Same customer, another user claimed in metadata → mismatch (the owner of a customer never changes).
  assert.match(await code(apply({ p_stripe_customer_id: "cus_C1", p_stripe_subscription_id: "sub_C1", p_user_id: other, p_event_created: iso(NOW + 5) })), /BILLING_OWNER_MISMATCH/);
  // The subscription id moved to another user's customer → mismatch.
  await apply({ p_stripe_customer_id: "cus_C2", p_stripe_subscription_id: "sub_C2", p_user_id: other });
  assert.match(await code(apply({ p_stripe_customer_id: "cus_C2", p_stripe_subscription_id: "sub_C1", p_event_created: iso(NOW + 6) })), /BILLING_OWNER_MISMATCH/);
  assert.equal((await sub("sub_C1")).user_id, u);
  // Family customer can never get a solo subscription.
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [other]);
  await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ('cus_Fam1', $1, $2)", [f.id, other]);
  assert.match(await code(apply({ p_stripe_customer_id: "cus_Fam1", p_stripe_subscription_id: "sub_C3", p_user_id: other })), /INVALID_PLAN/);
  // Deleted account (unknown user, new customer): acknowledged, nothing written.
  const gone = "00000000-0000-4000-8000-00000000dead";
  const r = await apply({ p_stripe_customer_id: "cus_C4", p_stripe_subscription_id: "sub_C4", p_user_id: gone, p_event_id: "evt_C4" });
  assert.deepEqual(r, { applied: false, reason: "owner_not_found" });
  assert.equal(await sub("sub_C4"), undefined);
  assert.ok((await admin("select processed_at from public.stripe_events where id = 'evt_C4'"))[0].processed_at);
  // Validation
  assert.match(await code(apply({ p_stripe_customer_id: "nope", p_user_id: u })), /INVALID_REQUEST/);
  assert.match(await code(apply({ p_stripe_customer_id: "cus_C1", p_stripe_subscription_id: "sub_C1", p_status: "weird" })), /INVALID_STATUS/);
  assert.match(await code(apply({ p_stripe_customer_id: "cus_C1", p_stripe_subscription_id: "sub_C1", p_plan_id: "family" })), /INVALID_PLAN/);
  // Account deletion cascades the solo billing rows.
  const tmp = await user(next());
  await apply({ p_stripe_customer_id: "cus_C5", p_stripe_subscription_id: "sub_C5", p_user_id: tmp });
  await admin("delete from auth.users where id = $1", [tmp]);
  assert.equal(await sub("sub_C5"), undefined);
});

test("grants: authenticated / anon cannot write or check eligibility; a user cannot call the writer even via SQL", async () => {
  const u = await user(next());
  for (const sql of [
    "select public.billing_apply_user_subscription(p_stripe_customer_id => 'cus_G1', p_stripe_subscription_id => 'sub_G1', p_status => 'active', p_current_period_end => now(), p_user_id => auth.uid())",
    "select public.billing_solo_eligibility(auth.uid())",
    "select public.account_billing_blockers(auth.uid())",
  ]) {
    await as(u);
    assert.match(await code(q(sql)), /permission denied/, sql);
  }
  await ctx.reset();
  await database.exec("set role anon");
  assert.match(await code(q("select public.billing_status_for_user('00000000-0000-4000-8000-000000000001')")), /permission denied/);
  await ctx.reset();
  // Even with EXECUTE (superuser call with a JWT set), the writer refuses a signed-in caller.
  await admin("select set_config('request.jwt.claim.sub', $1, false)", [u]);
  assert.match(await code(q("select public.billing_apply_user_subscription(p_stripe_customer_id => 'cus_G1', p_stripe_subscription_id => 'sub_G1', p_status => 'active', p_current_period_end => now(), p_user_id => $1)", [u])), /FORBIDDEN/);
  await ctx.reset();
  // Users never write billing tables directly.
  await as(u);
  assert.match(await code(q("insert into public.billing_customers (stripe_customer_id, user_id) values ('cus_G2', $1)", [u])), /permission denied/);
  assert.match(await code(q("update public.billing_subscriptions set status = 'active'")), /permission denied/);
  await ctx.reset();
});

test("RLS: the solo owner reads their own customer + subscription, nobody else does", async () => {
  const u = await user(next());
  const other = await user(next());
  await apply({ p_stripe_customer_id: "cus_R1", p_stripe_subscription_id: "sub_R1", p_user_id: u });
  await as(u);
  assert.deepEqual((await q("select stripe_subscription_id, plan_id from public.billing_subscriptions")).map((r) => r.stripe_subscription_id), ["sub_R1"]);
  assert.deepEqual((await q("select stripe_customer_id from public.billing_customers")).map((r) => r.stripe_customer_id), ["cus_R1"]);
  await as(other);
  assert.equal((await q("select 1 from public.billing_subscriptions where stripe_subscription_id = 'sub_R1'")).length, 0);
  assert.equal((await q("select 1 from public.billing_customers where stripe_customer_id = 'cus_R1'")).length, 0);
  await ctx.reset();
});

test("billing_status_for_user: own status (active / grace / expired / none), FORBIDDEN for others", async () => {
  const u = await user(next());
  await as(u);
  const none = (await q("select public.billing_status_for_user($1) s", [u]))[0].s;
  assert.deepEqual([none.plan, none.state, none.has_customer, none.cancel_at_period_end], [null, null, false, false]);
  await apply({ p_stripe_customer_id: "cus_T1", p_stripe_subscription_id: "sub_T1", p_user_id: u, p_cancel_at_period_end: true });
  await as(u);
  const s = (await q("select public.billing_status_for_user($1) s", [u]))[0].s;
  assert.deepEqual([s.plan, s.state, s.subscription_status, s.interval, s.cancel_at_period_end, s.has_customer], ["solo", "active", "active", "month", true, true]);
  assert.equal(s.valid_until, new Date((NOW + 29 * day) * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }));
  // past_due → grace (7 days from the period start)
  await apply({ p_stripe_customer_id: "cus_T1", p_stripe_subscription_id: "sub_T1", p_status: "past_due", p_current_period_start: iso(NOW - 2 * day), p_event_created: iso(NOW + 50) });
  await as(u);
  const g = (await q("select public.billing_status_for_user($1) s", [u]))[0].s;
  assert.equal(g.state, "grace");
  assert.ok(g.grace_until);
  // canceled → expired
  await apply({ p_stripe_customer_id: "cus_T1", p_stripe_subscription_id: "sub_T1", p_status: "canceled", p_current_period_end: iso(NOW - day), p_event_created: iso(NOW + 60) });
  await as(u);
  assert.equal((await q("select public.billing_status_for_user($1) s", [u]))[0].s.state, "expired");
  const other = await user(next());
  await as(other);
  assert.match(await code(q("select public.billing_status_for_user($1)", [u])), /FORBIDDEN/);
  await asService();
  assert.equal((await q("select public.billing_status_for_user($1) s", [u]))[0].s.plan, "solo");
  await ctx.reset();
});

test("billing_solo_eligibility: student / parent / teacher; covered by own solo, family subscription, school licence", async () => {
  const elig = async (u) => { await asService(); const [r] = await q("select public.billing_solo_eligibility($1) e", [u]); await ctx.reset(); return r.e; };
  const student = await user(next());
  assert.deepEqual(await elig(student), { role: "student", account_type: "independent_student", blocked: false, covered_by: null });
  await admin("update public.account_access set blocked_at = now() where user_id = $1", [student]);
  assert.equal((await elig(student)).blocked, true);
  await admin("update public.account_access set blocked_at = null where user_id = $1", [student]);
  const parent = await user(next(), { meta: { account_type: "parent" } });
  assert.equal((await elig(parent)).role, "parent");
  const teacher = await user(next(), { meta: { role: "teacher" } });
  assert.deepEqual(await elig(teacher), { role: "staff", account_type: null, blocked: false, covered_by: null });
  // own open solo (incomplete counts: first payment in progress)
  const s2 = await user(next());
  await apply({ p_stripe_customer_id: "cus_E1", p_stripe_subscription_id: "sub_E1", p_user_id: s2, p_status: "incomplete" });
  assert.equal((await elig(s2)).covered_by, "solo");
  await apply({ p_stripe_customer_id: "cus_E1", p_stripe_subscription_id: "sub_E1", p_status: "incomplete_expired", p_event_created: iso(NOW + 70) });
  assert.equal((await elig(s2)).covered_by, null, "expired first payment does not block a new checkout");
  // child in a family with an active family subscription
  const p2 = await user(next(), { meta: { account_type: "parent" } });
  const child = await user(next());
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [p2]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, p2]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status) values ($1, $2, 'child', 'granted')", [f.id, child]);
  await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ('cus_EF', $1, $2)", [f.id, p2]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start, current_period_end, family_id)
    values ('sub_EF', 'cus_EF', 'family', 'active', now() - interval '1 day', now() + interval '29 days', $1)`, [f.id]);
  assert.equal((await elig(child)).covered_by, "family");
  // student in a class of a licensed school
  const s3 = await user(next());
  const t = await user(next(), { meta: { role: "teacher" } });
  const [sc] = await admin("insert into public.schools (name) values ('Sek Solo') returning id");
  await admin(`insert into public.school_licences (school_id, package, status, student_limit, valid_from, valid_until) values ($1, 'starter', 'active', 100, current_date - 30, '2099-12-31')`, [sc.id]);
  const [c] = await admin("insert into public.classes (teacher_id, name, join_code, school_id) values ($1, '10s', 'SOLOJN01', $2) returning id", [t, sc.id]);
  await admin("insert into public.class_members (class_id, student_id) values ($1, $2)", [c.id, s3]);
  assert.equal((await elig(s3)).covered_by, "school");
});

test("account_billing_blockers: a renewing solo subscription blocks deletion; canceling / canceled does not", async () => {
  const blockers = async (u) => (await admin("select public.account_billing_blockers($1) b", [u]))[0].b;
  const u = await user(next());
  assert.deepEqual(await blockers(u), []);
  await apply({ p_stripe_customer_id: "cus_D1", p_stripe_subscription_id: "sub_D1", p_user_id: u });
  assert.deepEqual(await blockers(u), [{ kind: "solo", plan_id: "solo", status: "active" }]);
  await apply({ p_stripe_customer_id: "cus_D1", p_stripe_subscription_id: "sub_D1", p_cancel_at_period_end: true, p_event_created: iso(NOW + 80) });
  assert.deepEqual(await blockers(u), []);
  await apply({ p_stripe_customer_id: "cus_D1", p_stripe_subscription_id: "sub_D1", p_status: "canceled", p_event_created: iso(NOW + 90) });
  assert.deepEqual(await blockers(u), []);
  // Family part unchanged: last parent of a family with a renewing subscription is still blocked.
  const p = await user(next(), { meta: { account_type: "parent" } });
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [p]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, p]);
  await admin("insert into public.billing_customers (stripe_customer_id, family_id, created_by) values ('cus_DF', $1, $2)", [f.id, p]);
  await admin(`insert into public.billing_subscriptions (stripe_subscription_id, stripe_customer_id, plan_id, status, family_id) values ('sub_DF', 'cus_DF', 'family', 'active', $1)`, [f.id]);
  assert.deepEqual((await blockers(p)).map((b) => b.kind), ["family"]);
});

test("access: a paid solo subscription lifts the paywall after the trial (reason 'subscription'); canceled → expired", async () => {
  const u = await user(next());
  await expire(u);
  await mode("on");
  try {
    assert.equal((await access(u)).has_access, false);
    await apply({ p_stripe_customer_id: "cus_X1", p_stripe_subscription_id: "sub_X1", p_user_id: u });
    const a = await access(u);
    assert.deepEqual([a.has_access, a.state, a.reason, a.subscription?.plan, a.subscription?.interval], [true, "active", "subscription", "solo", "month"]);
    await apply({ p_stripe_customer_id: "cus_X1", p_stripe_subscription_id: "sub_X1", p_status: "canceled", p_current_period_end: iso(NOW - 3 * day), p_event_created: iso(NOW + 99) });
    const b = await access(u);
    assert.deepEqual([b.has_access, b.state], [false, "expired"]);
  } finally { await mode("test_users"); }
});
