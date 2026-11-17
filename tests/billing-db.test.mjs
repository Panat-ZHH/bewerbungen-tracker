// Stripe billing tables (supabase/migrations/20261116200000_billing_stripe.sql): billing_customers, billing_subscriptions,
// stripe_events, Stripe licences in school_licences, billing_apply_subscription (service role only) and
// billing_status_for_school / billing_status_for_family. Runs every migration in order on PGlite (seeded class "10a" with
// four students from the teacher helper). No network, no Stripe: the webhook's RPC calls are simulated here.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { setupTeacherDb, seededClasses, ids as S } from "./helpers/teacher-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = { adminA: id(1101), adminB: id(1102), parentA: id(1103), childA: id(1104), parentB: id(1105), newStudent: id(1106), extra: id(1107) };
const day = (n) => new Date(Date.now() + n * 86400000);
const iso = (n) => day(n).toISOString();
const zurichDate = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(day(n));

let ctx, schoolA, schoolB, famA, famB, classes;

const svc = async (sql, params) => { await ctx.as(null); return ctx.admin(sql, params); };
const asUser = async (user, sql, params) => { await ctx.as(user); return ctx.rpc(sql, params); };
const fails = async (user, sql, params) => { await ctx.as(user); return ctx.code(ctx.rpc(sql, params)); };

/** Calls billing_apply_subscription like the webhook does (service role = superuser here, auth.uid() null). */
const apply = async (args) => {
  const names = Object.keys(args);
  const sql = `select public.billing_apply_subscription(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
  return (await svc(sql, Object.values(args)))[0].r;
};
const schoolSub = (over = {}) => ({
  p_stripe_customer_id: "cus_SchoolA1", p_stripe_subscription_id: "sub_SchoolA1", p_plan_id: "starter", p_status: "active",
  p_current_period_start: iso(0), p_current_period_end: iso(365), p_school_id: schoolA, p_created_by: U.adminA, ...over,
});
const licences = (where, params) => svc(`select id, package, status, source, student_limit, valid_from::text, valid_until::text, stripe_subscription_id
  from public.school_licences where ${where} order by created_at, id`, params);

before(async () => {
  ctx = await setupTeacherDb({ seed: true });
  // Supabase has a service_role; the helper does not. Create it and re-run the (idempotent) billing migration for its grants.
  await ctx.admin("create role service_role");
  await ctx.apply("20261116200000_billing_stripe.sql");
  await ctx.apply("20261117100000_billing_hardening.sql");
  classes = await seededClasses(ctx);
  const rows = Object.entries(U).map(([k, v]) => `('${v}','${k.toLowerCase()}@billing.ch','${JSON.stringify({ full_name: k })}')`);
  await ctx.admin(`insert into auth.users values ${rows.join(",")}`);
  schoolA = (await ctx.admin("select public.platform_create_school('Schule A') as id"))[0].id;
  schoolB = (await ctx.admin("select public.platform_create_school('Schule B') as id"))[0].id;
  await ctx.admin("insert into public.school_admins (school_id, user_id) values ($1,$2), ($3,$4)", [schoolA, U.adminA, schoolB, U.adminB]);
  famA = (await ctx.admin("insert into public.families (name, created_by) values ('Familie A', $1) returning id", [U.parentA]))[0].id;
  famB = (await ctx.admin("insert into public.families (name, created_by) values ('Familie B', $1) returning id", [U.parentB]))[0].id;
  await ctx.admin(`insert into public.family_members (family_id, user_id, role) values ($1,$2,'parent'), ($1,$3,'child'), ($4,$5,'parent')`,
    [famA, U.parentA, U.childA, famB, U.parentB]);
});

test("schema: new tables have RLS, no anon access, no direct writes for users; school_licences extended", async () => {
  const rls = (await ctx.admin(`select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and relname in ('billing_customers','billing_subscriptions','stripe_events') order by relname`));
  assert.deepEqual(rls.map((r) => [r.relname, r.relrowsecurity]), [["billing_customers", true], ["billing_subscriptions", true], ["stripe_events", true]]);
  const priv = await ctx.admin(`select t, has_table_privilege('anon', 'public.'||t, 'select') as anon_sel,
      has_table_privilege('authenticated', 'public.'||t, 'insert') or has_table_privilege('authenticated', 'public.'||t, 'update')
        or has_table_privilege('authenticated', 'public.'||t, 'delete') as user_write,
      has_table_privilege('authenticated', 'public.'||t, 'select') as user_sel
    from unnest(array['billing_customers','billing_subscriptions','stripe_events']) t order by t`);
  assert.deepEqual(priv.map((r) => [r.t, r.anon_sel, r.user_write, r.user_sel]),
    [["billing_customers", false, false, true], ["billing_subscriptions", false, false, true], ["stripe_events", false, false, false]]);
  const cols = (await ctx.admin("select column_name from information_schema.columns where table_name='school_licences'")).map((r) => r.column_name);
  for (const c of ["source", "stripe_subscription_id", "valid_until", "status"]) assert.ok(cols.includes(c), c);
});

test("billing_apply_subscription is executable by service_role only", async () => {
  const f = "public.billing_apply_subscription(text,text,text,text,timestamptz,timestamptz,boolean,text,text,uuid,uuid,uuid,integer,text,text,timestamptz)";
  const r = (await ctx.admin(`select has_function_privilege('anon', '${f}', 'execute') a, has_function_privilege('authenticated', '${f}', 'execute') u,
    has_function_privilege('service_role', '${f}', 'execute') s`))[0];
  assert.deepEqual(r, { a: false, u: false, s: true });
  assert.match(await fails(U.adminA, "select public.billing_apply_subscription('cus_X','sub_X','starter','active',now())"), /permission denied/);
  await ctx.asAnon();
  assert.match(await ctx.code(ctx.rpc("select public.billing_apply_subscription('cus_X','sub_X','starter','active',now())")), /permission denied/);
  // The status functions are for admins/parents (authenticated) and the service role, never anon.
  for (const fn of ["billing_status_for_school(uuid)", "billing_status_for_family(uuid)"]) {
    const p = (await ctx.admin(`select has_function_privilege('anon', 'public.${fn}', 'execute') a, has_function_privilege('authenticated', 'public.${fn}', 'execute') u`))[0];
    assert.deepEqual(p, { a: false, u: true }, fn);
  }
});

test("pilot/manual licences: existing rows labelled, new pilot rows labelled, apply never touches them", async () => {
  await ctx.admin("select public.platform_assign_licence($1, 'pilot')", [schoolA]);
  await ctx.admin("select public.platform_assign_licence($1, 'professional')", [schoolB]);
  const before = await licences("school_id in ($1,$2)", [schoolA, schoolB]);
  assert.deepEqual(before.map((l) => [l.package, l.status, l.source, l.stripe_subscription_id]),
    [["pilot", "pilot", "pilot", null], ["professional", "active", "manual", null]]);
  // Direct inserts of a Stripe row without an id (or an id on a manual row) are rejected by the constraint.
  assert.ok(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package, source) values ($1,'starter','stripe')", [schoolA])));
  assert.ok(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package, stripe_subscription_id) values ($1,'starter','sub_x')", [schoolA])));
  assert.ok(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package, source) values ($1,'starter','paypal')", [schoolA])));
});

test("apply creates customer + subscription + Stripe licence atomically; same input twice is idempotent", async () => {
  const r1 = await apply(schoolSub());
  assert.equal(r1.applied, true);
  assert.equal(r1.licence_status, "active");
  const snapshot = async () => ({
    customers: await svc("select stripe_customer_id, school_id, family_id, created_by from public.billing_customers order by stripe_customer_id"),
    subs: await svc("select stripe_subscription_id, plan_id, status, cancel_at_period_end, school_id, licence_id from public.billing_subscriptions order by 1"),
    lic: await licences("school_id = $1", [schoolA]),
  });
  const s1 = await snapshot();
  assert.deepEqual(s1.customers, [{ stripe_customer_id: "cus_SchoolA1", school_id: schoolA, family_id: null, created_by: U.adminA }]);
  assert.equal(s1.subs[0].licence_id, r1.licence_id);
  const stripeLic = s1.lic.find((l) => l.source === "stripe");
  assert.deepEqual({ ...stripeLic, id: undefined }, { id: undefined, package: "starter", status: "active", source: "stripe", student_limit: 100,
    valid_from: zurichDate(0), valid_until: zurichDate(365), stripe_subscription_id: "sub_SchoolA1" });
  const r2 = await apply(schoolSub());
  assert.equal(r2.licence_id, r1.licence_id);
  assert.deepEqual(await snapshot(), s1, "second identical apply changes nothing");
  // The pilot row is untouched; the newer usable Stripe licence now governs.
  const pilot = s1.lic.find((l) => l.source === "pilot");
  assert.equal(pilot.status, "pilot");
  assert.equal((await svc("select (public._school_current_licence($1)).source as s", [schoolA]))[0].s, "stripe");
});

test("stripe_events: a processed event is skipped, an unprocessed (webhook-recorded) one is applied, stale events are ignored", async () => {
  const ev = { p_event_id: "evt_A1", p_event_type: "customer.subscription.updated", p_event_created: iso(0) };
  const r1 = await apply(schoolSub({ ...ev, p_plan_id: "professional" }));
  assert.equal(r1.applied, true);
  assert.equal((await licences("stripe_subscription_id = 'sub_SchoolA1'"))[0].student_limit, 300, "upgrade updates the same licence row");
  const dup = await apply(schoolSub({ ...ev, p_plan_id: "enterprise" }));
  assert.deepEqual(dup, { applied: false, reason: "duplicate_event" });
  assert.equal((await licences("stripe_subscription_id = 'sub_SchoolA1'"))[0].package, "professional", "duplicate did not change anything");
  const ev1 = (await svc("select type, processed_at is not null as done from public.stripe_events where id='evt_A1'"))[0];
  assert.deepEqual(ev1, { type: "customer.subscription.updated", done: true });
  // Webhook recorded the event itself first (processed_at null) -> still applied, then marked processed.
  await svc("insert into public.stripe_events (id, type) values ('evt_A2', 'invoice.paid')");
  const r2 = await apply(schoolSub({ p_event_id: "evt_A2", p_event_type: "invoice.paid", p_event_created: iso(0.01), p_plan_id: "professional", p_latest_invoice_status: "paid" }));
  assert.equal(r2.applied, true);
  assert.equal((await svc("select processed_at is not null as d from public.stripe_events where id='evt_A2'"))[0].d, true);
  // An older event delivered late must not roll the state back.
  const stale = await apply(schoolSub({ p_event_id: "evt_A0", p_event_created: iso(-1), p_plan_id: "starter", p_status: "unpaid" }));
  assert.equal(stale.reason, "stale_event");
  const sub = (await svc("select plan_id, status, latest_invoice_status from public.billing_subscriptions where stripe_subscription_id='sub_SchoolA1'"))[0];
  assert.deepEqual(sub, { plan_id: "professional", status: "active", latest_invoice_status: "paid" });
  // Users cannot read or write stripe_events.
  assert.match(await fails(U.adminA, "select * from public.stripe_events"), /permission denied/);
});

test("validation: owner required on first sight, owner/plan mismatch, bad ids/status/plan", async () => {
  assert.match(await ctx.code(apply(schoolSub({ p_stripe_customer_id: "cus_New", p_stripe_subscription_id: "sub_New", p_school_id: null }))), /BILLING_OWNER_REQUIRED/);
  assert.match(await ctx.code(apply(schoolSub({ p_school_id: schoolB }))), /BILLING_OWNER_MISMATCH/, "customer belongs to school A");
  assert.match(await ctx.code(apply(schoolSub({ p_plan_id: "family" }))), /INVALID_PLAN/);
  assert.match(await ctx.code(apply(schoolSub({ p_plan_id: "pilot" }))), /INVALID_PLAN/);
  assert.match(await ctx.code(apply(schoolSub({ p_status: "weird" }))), /INVALID_STATUS/);
  assert.match(await ctx.code(apply(schoolSub({ p_stripe_customer_id: "cus_x'; drop table x; --" }))), /INVALID_REQUEST/);
  assert.match(await ctx.code(apply(schoolSub({ p_stripe_customer_id: "cus_Ind", p_stripe_subscription_id: "sub_Ind", p_plan_id: "individual", p_school_id: schoolB }))), /LICENCE_LIMIT_REQUIRED/);
  // A deleted owner is acknowledged without changes (no endless webhook retries).
  const gone = await apply(schoolSub({ p_stripe_customer_id: "cus_Gone", p_stripe_subscription_id: "sub_Gone", p_school_id: id(9999), p_event_id: "evt_Gone" }));
  assert.deepEqual(gone, { applied: false, reason: "owner_not_found" });
  assert.equal((await svc("select count(*)::int n from public.billing_customers where stripe_customer_id='cus_Gone'"))[0].n, 0);
  // A logged-in user calling it (e.g. via a leaked grant) is still refused by the body guard.
  await ctx.admin("grant execute on function public.billing_apply_subscription(text,text,text,text,timestamptz,timestamptz,boolean,text,text,uuid,uuid,uuid,integer,text,text,timestamptz) to authenticated");
  assert.match(await fails(U.adminA, "select public.billing_apply_subscription('cus_SchoolA1','sub_SchoolA1','enterprise','active',now())"), /FORBIDDEN/);
  await ctx.admin("revoke execute on function public.billing_apply_subscription(text,text,text,text,timestamptz,timestamptz,boolean,text,text,uuid,uuid,uuid,integer,text,text,timestamptz) from authenticated");
});

test("student limit is still enforced by the existing trigger on a Stripe licence", async () => {
  // School B: individual plan with exactly 4 seats (Stripe), class 10a has 4 students.
  await apply({ p_stripe_customer_id: "cus_SchoolB1", p_stripe_subscription_id: "sub_SchoolB1", p_plan_id: "individual", p_status: "active",
    p_current_period_start: iso(0), p_current_period_end: iso(365), p_school_id: schoolB, p_student_limit: 4 });
  assert.equal((await svc("select (public._school_current_licence($1)).student_limit as l", [schoolB]))[0].l, 4);
  await ctx.admin("update public.classes set school_id = $1 where id = $2", [schoolB, classes["10a"].id]);
  assert.equal((await svc("select public._school_student_count($1) as n", [schoolB]))[0].n, 4);
  const err = await fails(U.newStudent, "select * from public.class_join($1)", [classes["10a"].join_code]);
  assert.match(err, /LICENCE_LIMIT_REACHED/);
  // Upgrade through Stripe -> the same join now works.
  await apply({ p_stripe_customer_id: "cus_SchoolB1", p_stripe_subscription_id: "sub_SchoolB1", p_plan_id: "starter", p_status: "active",
    p_current_period_end: iso(365) });
  await asUser(U.newStudent, "select * from public.class_join($1)", [classes["10a"].join_code]);
  assert.equal((await svc("select public._school_student_count($1) as n", [schoolB]))[0].n, 5);
});

test("RLS isolation between two schools", async () => {
  const seen = async (user) => ({
    customers: (await asUser(user, "select stripe_customer_id from public.billing_customers order by 1")).map((r) => r.stripe_customer_id),
    subs: (await asUser(user, "select stripe_subscription_id from public.billing_subscriptions order by 1")).map((r) => r.stripe_subscription_id),
    licSources: (await asUser(user, "select school_id, source from public.school_licences order by created_at")).map((r) => [r.school_id === schoolA ? "A" : "B", r.source]),
  });
  assert.deepEqual(await seen(U.adminA), { customers: ["cus_SchoolA1"], subs: ["sub_SchoolA1"], licSources: [["A", "pilot"], ["A", "stripe"]] });
  assert.deepEqual(await seen(U.adminB), { customers: ["cus_SchoolB1"], subs: ["sub_SchoolB1"], licSources: [["B", "manual"], ["B", "stripe"]] });
  for (const u of [U.parentA, U.childA, S.owner, S.s1, U.extra]) {
    assert.deepEqual(await seen(u), { customers: [], subs: [], licSources: [] }, `user ${u} sees nothing`);
  }
  assert.match(await fails(U.adminA, "select public.billing_status_for_school($1)", [schoolB]), /FORBIDDEN/);
  assert.match(await fails(U.parentA, "select public.billing_status_for_school($1)", [schoolA]), /FORBIDDEN/);
  // No direct writes, even on own rows.
  assert.match(await fails(U.adminA, "update public.billing_subscriptions set status='active'"), /permission denied/);
  assert.match(await fails(U.adminA, "insert into public.billing_customers (stripe_customer_id, school_id) values ('cus_Hack', $1)", [schoolA]), /permission denied/);
  assert.match(await fails(U.adminA, "update public.school_licences set student_limit = 100000"), /permission denied/);
  await ctx.asAnon();
  assert.match(await ctx.code(ctx.rpc("select * from public.billing_customers")), /permission denied/);
});

test("billing_status_for_school: shape for admins", async () => {
  const st = (await asUser(U.adminA, "select public.billing_status_for_school($1) as s", [schoolA]))[0].s;
  assert.deepEqual(st, {
    school_id: schoolA, students_used: 0, plan: "professional", state: "active", licence_status: "active", source: "stripe", student_limit: 300,
    valid_until: zurichDate(365), subscription_status: "active", cancel_at_period_end: false, current_period_end: st.current_period_end,
    collection_method: "charge_automatically", latest_invoice_status: "paid", has_customer: true,
  });
  // A school without Stripe: the manual licence, no subscription.
  await ctx.admin("delete from public.school_licences where school_id=$1 and source='stripe'", [schoolB]);
  const b = (await asUser(U.adminB, "select public.billing_status_for_school($1) as s", [schoolB]))[0].s;
  assert.equal(b.source, "manual");
  assert.equal(b.plan, "professional");
  assert.equal(b.has_customer, true);
});

test("subscription deleted -> licence keeps working until the period end, then expires", async () => {
  const sub = { p_stripe_customer_id: "cus_SchoolA1", p_stripe_subscription_id: "sub_SchoolA1", p_plan_id: "professional",
    p_current_period_start: iso(-355), p_current_period_end: iso(10) };
  await apply({ ...sub, p_status: "active", p_cancel_at_period_end: true });
  let st = (await svc("select public.billing_status_for_school($1) as s", [schoolA]))[0].s;
  assert.equal(st.cancel_at_period_end, true);
  await apply({ ...sub, p_status: "canceled", p_event_id: "evt_Del1", p_event_type: "customer.subscription.deleted" });
  st = (await svc("select public.billing_status_for_school($1) as s", [schoolA]))[0].s;
  assert.deepEqual([st.state, st.subscription_status, st.valid_until], ["active", "canceled", zurichDate(10)]);
  // After the period end the licence is expired (simulated by moving the period into the past).
  await apply({ ...sub, p_current_period_start: iso(-400), p_current_period_end: iso(-2), p_status: "canceled" });
  const lic = (await licences("stripe_subscription_id='sub_SchoolA1'"))[0];
  assert.equal((await svc("select public._licence_state($1, null, $2::date, $3::date) as s", [lic.status, lic.valid_from, lic.valid_until]))[0].s, "expired");
  // unpaid -> expired immediately; paid again -> active.
  await apply({ ...sub, p_status: "unpaid" });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolA1'"))[0].status, "expired");
  await apply({ ...sub, p_status: "active" });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolA1'"))[0].status, "active");
  // Pilot row still untouched after all of that.
  assert.deepEqual((await licences("school_id=$1 and source='pilot'", [schoolA])).map((l) => l.status), ["pilot"]);
});

test("incomplete subscriptions create no licence until paid; invoice collection is stored", async () => {
  const sub = { p_stripe_customer_id: "cus_SchoolA1", p_stripe_subscription_id: "sub_SchoolA2", p_plan_id: "enterprise",
    p_current_period_end: iso(365), p_collection_method: "send_invoice", p_latest_invoice_status: "open" };
  const r = await apply({ ...sub, p_status: "incomplete" });
  assert.equal(r.licence_id, null);
  assert.equal((await licences("stripe_subscription_id='sub_SchoolA2'")).length, 0);
  await apply({ ...sub, p_status: "active" });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolA2'"))[0].student_limit, 800);
  const s = (await svc("select collection_method, latest_invoice_status from public.billing_subscriptions where stripe_subscription_id='sub_SchoolA2'"))[0];
  assert.deepEqual(s, { collection_method: "send_invoice", latest_invoice_status: "open" });
});

test("families: apply, RLS between two families, parent-only status, paused", async () => {
  const fam = { p_stripe_customer_id: "cus_FamA", p_stripe_subscription_id: "sub_FamA", p_plan_id: "family", p_status: "active",
    p_current_period_start: iso(0), p_current_period_end: iso(365), p_family_id: famA, p_created_by: U.parentA };
  const r = await apply(fam);
  assert.equal(r.applied, true);
  await apply({ ...fam, p_stripe_customer_id: "cus_FamB", p_stripe_subscription_id: "sub_FamB", p_family_id: famB, p_created_by: U.parentB });
  assert.match(await ctx.code(apply({ ...fam, p_stripe_subscription_id: "sub_FamA9", p_plan_id: "starter" })), /INVALID_PLAN/);
  const lic = (await svc("select plan_type, package, status, source, seats_children, student_limit from public.school_licences where stripe_subscription_id='sub_FamA'"))[0];
  assert.deepEqual(lic, { plan_type: "family", package: "family", status: "active", source: "stripe", seats_children: 1, student_limit: 1 });

  const seen = async (u) => (await asUser(u, "select stripe_subscription_id from public.billing_subscriptions order by 1")).map((x) => x.stripe_subscription_id);
  assert.deepEqual(await seen(U.parentA), ["sub_FamA"]);
  assert.deepEqual(await seen(U.parentB), ["sub_FamB"]);
  assert.deepEqual(await seen(U.childA), [], "children never see billing");
  assert.deepEqual(await seen(U.adminA), ["sub_SchoolA1", "sub_SchoolA2"], "school admin sees no family rows");
  const st = (await asUser(U.parentA, "select public.billing_status_for_family($1) as s", [famA]))[0].s;
  assert.deepEqual([st.plan, st.state, st.source, st.subscription_status, st.valid_until, st.has_customer], ["family", "active", "stripe", "active", zurichDate(365), true]);
  assert.match(await fails(U.parentA, "select public.billing_status_for_family($1)", [famB]), /FORBIDDEN/);
  assert.match(await fails(U.childA, "select public.billing_status_for_family($1)", [famA]), /FORBIDDEN/);
  assert.match(await fails(U.adminA, "select public.billing_status_for_family($1)", [famA]), /FORBIDDEN/);
  // The family seat logic reads the Stripe plan (1 child seat used by childA -> a second child is refused).
  assert.match(await ctx.code(svc("select public._family_assert_seat($1, 'child')", [famA])), /FAMILY_SEAT_LIMIT/);
  await apply({ ...fam, p_status: "paused" });
  assert.equal((await asUser(U.parentA, "select public.billing_status_for_family($1) as s", [famA]))[0].s.state, "paused");
});

test("deleting a family removes its billing rows (cascade); the user's export still works", async () => {
  await ctx.admin("delete from public.families where id=$1", [famB]);
  assert.equal((await svc("select count(*)::int n from public.billing_subscriptions where stripe_subscription_id='sub_FamB'"))[0].n, 0);
  assert.equal((await svc("select count(*)::int n from public.billing_customers where stripe_customer_id='cus_FamB'"))[0].n, 0);
  // A late webhook for the deleted family is acknowledged without error.
  const late = await apply({ p_stripe_customer_id: "cus_FamB", p_stripe_subscription_id: "sub_FamB", p_plan_id: "family", p_status: "canceled",
    p_current_period_end: iso(1), p_family_id: famB });
  assert.equal(late.reason, "owner_not_found");
  const exp = (await asUser(U.parentA, "select public.export_my_data() as d"))[0].d;
  assert.ok(JSON.stringify(exp).includes("cus_FamA"), "billing_customers.created_by makes the row part of the parent's export");
});

test("past_due grace: a failed renewal keeps access 14 days (card) / 44 days (invoice), not the whole unpaid period", async () => {
  // Renewal: Stripe already moved the period forward (start = today - 3, end = +362) but the payment failed.
  const sub = { p_stripe_customer_id: "cus_SchoolA1", p_stripe_subscription_id: "sub_SchoolPd1", p_plan_id: "starter",
    p_current_period_start: iso(-3), p_current_period_end: iso(362) };
  await apply({ ...sub, p_status: "past_due", p_latest_invoice_status: "open" });
  let lic = (await licences("stripe_subscription_id='sub_SchoolPd1'"))[0];
  assert.deepEqual([lic.status, lic.valid_until], ["active", zurichDate(11)]);
  // Previously stored 'paid' (last year's invoice) must not lift the clamp when the snapshot carries no invoice status.
  await apply({ ...sub, p_status: "active", p_latest_invoice_status: "paid", p_current_period_start: iso(-368), p_current_period_end: iso(-3) });
  await apply({ ...sub, p_status: "past_due" });
  lic = (await licences("stripe_subscription_id='sub_SchoolPd1'"))[0];
  assert.equal(lic.valid_until, zurichDate(11));
  // Grace over (renewal 20 days ago): access ends.
  await apply({ ...sub, p_status: "past_due", p_current_period_start: iso(-20), p_current_period_end: iso(345) });
  lic = (await licences("stripe_subscription_id='sub_SchoolPd1'"))[0];
  assert.equal((await svc("select public._licence_state($1, null, $2::date, $3::date) as s", [lic.status, lic.valid_from, lic.valid_until]))[0].s, "expired");
  // Paid late -> full period again.
  await apply({ ...sub, p_status: "active", p_latest_invoice_status: "paid", p_current_period_start: iso(-20), p_current_period_end: iso(345) });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolPd1'"))[0].valid_until, zurichDate(345));
  // Invoice (send_invoice): 30 days payment term + 14 days.
  const inv = { ...sub, p_stripe_subscription_id: "sub_SchoolPd2", p_collection_method: "send_invoice", p_current_period_start: iso(-31), p_current_period_end: iso(334) };
  await apply({ ...inv, p_status: "past_due", p_latest_invoice_status: "open" });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolPd2'"))[0].valid_until, zurichDate(13));
  // A non-past_due status is never clamped.
  await apply({ ...inv, p_status: "active" });
  assert.equal((await licences("stripe_subscription_id='sub_SchoolPd2'"))[0].valid_until, zurichDate(334));
});

test("canceled immediately (refund / dunning): the webhook passes ended_at as period end, access ends then", async () => {
  const sub = { p_stripe_customer_id: "cus_SchoolA1", p_stripe_subscription_id: "sub_SchoolCi1", p_plan_id: "starter", p_current_period_start: iso(-30) };
  await apply({ ...sub, p_status: "active", p_current_period_end: iso(335) });
  await apply({ ...sub, p_status: "canceled", p_current_period_end: iso(-1) });
  const lic = (await licences("stripe_subscription_id='sub_SchoolCi1'"))[0];
  assert.equal(lic.valid_until, zurichDate(-1));
  assert.equal((await svc("select public._licence_state($1, null, $2::date, $3::date) as s", [lic.status, lic.valid_from, lic.valid_until]))[0].s, "expired");
});
