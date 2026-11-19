// Product tour state (table product_tour_state + RPC tour_state_set, migration 20261119100000_onboarding_funnel.sql) on PGlite
// with ALL migrations replayed. SPEC-DATA §6.2: own-row select only, no direct writes, enum/range errors, upsert, cascade, export,
// works behind the paywall / licence gate, rate limit, RLS policy uses (select auth.uid()) (perf rule).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb } from "./helpers/access-db.mjs";

const { admin, as, q, code, user, mode, expire } = await setupAccessDb();
let n = 900;
const next = () => ++n;
const set = async (u, ...args) => { await as(u); return (await q("select public.tour_state_set($1, $2, $3, $4) as r", [args[0], args[1], args[2], args[3] ?? null]))[0].r; };
const rows = async (u) => { await as(u); return q("select tour, version, status, last_step from public.product_tour_state order by tour"); };

test("own row only: set, read back, other users see nothing; upsert overwrites", async () => {
  const a = await user(next()); const b = await user(next());
  assert.deepEqual(await set(a, "schueler", 1, "skipped", 2), { tour: "schueler", version: 1, status: "skipped" });
  await set(b, "eltern", 1, "completed");
  assert.deepEqual(await rows(a), [{ tour: "schueler", version: 1, status: "skipped", last_step: 2 }]);
  assert.deepEqual(await rows(b), [{ tour: "eltern", version: 1, status: "completed", last_step: null }]);
  await set(a, "schueler", 2, "completed", 6);
  assert.deepEqual(await rows(a), [{ tour: "schueler", version: 2, status: "completed", last_step: 6 }]);
  await as(b);
  assert.deepEqual(await q("select * from public.product_tour_state where user_id = $1", [a]), [], "B cannot read A");
});

test("no direct insert / update / delete for authenticated; anon has nothing", async () => {
  const a = await user(next());
  await set(a, "schueler", 1, "completed");
  await as(a);
  assert.match(await code(q("insert into public.product_tour_state (user_id, tour, version, status) values ($1, 'eltern', 1, 'completed')", [a])), /permission denied/);
  await as(a);
  assert.match(await code(q("update public.product_tour_state set status = 'skipped' where user_id = $1", [a])), /permission denied/);
  await as(a);
  assert.match(await code(q("delete from public.product_tour_state where user_id = $1", [a])), /permission denied/);
  for (const priv of ["select", "insert", "update", "delete"]) {
    assert.equal((await admin(`select has_table_privilege('anon', 'public.product_tour_state', '${priv}') as ok`))[0].ok, false, priv);
  }
  assert.equal((await admin("select relrowsecurity from pg_class where oid = 'public.product_tour_state'::regclass"))[0].relrowsecurity, true);
});

test("enum / range errors: INVALID_REQUEST with the field as detail", async () => {
  const a = await user(next());
  for (const [args, field] of [[["x", 1, "done"], "tour"], [["schueler", 0, "completed"], "version"], [["schueler", 100, "completed"], "version"],
    [["schueler", 1, "done"], "status"], [["schueler", 1, null], "status"], [[null, 1, "completed"], "tour"], [["schueler", 1, "completed", 31], "step"],
    [["schueler", 1, "completed", -1], "step"], [["admin", 1, "completed"], "tour"]]) {
    let err = null;
    try { await set(a, ...args); } catch (e) { err = e; }
    assert.ok(err, JSON.stringify(args));
    assert.equal(err.message, "INVALID_REQUEST"); assert.equal(err.detail, field, JSON.stringify(args));
  }
  assert.deepEqual(await rows(a), []);
  await as(null);
  assert.match(await code(q("select public.tour_state_set('schueler', 1, 'completed')")), /NOT_AUTHENTICATED/);
});

test("works behind the paywall (expired trial, enforce on) and for an unlicensed teacher", async () => {
  await mode("on");
  const s = await user(next()); await expire(s);
  assert.equal((await admin("select public.app_access($1) as a", [s]))[0].a.has_access, false);
  await set(s, "schueler", 1, "skipped");
  const t = await user(next(), { meta: { role: "teacher" } });
  assert.equal((await admin("select public.app_access($1) as a", [t]))[0].a.has_access, false);
  await set(t, "lehrperson", 1, "completed");
  assert.equal((await rows(t)).length, 1);
  await mode("test_users");
});

test("cascade on user delete; included in export_my_data()", async () => {
  const a = await user(next());
  await set(a, "schueler", 1, "completed", 5);
  await as(a);
  const exp = (await q("select public.export_my_data() as e"))[0].e;
  assert.match(JSON.stringify(exp), /"product_tour_state":\[\{[^\]]*"tour":"schueler"/);
  await admin("delete from auth.users where id = $1", [a]);
  assert.equal((await admin("select count(*)::int as c from public.product_tour_state where user_id = $1", [a]))[0].c, 0);
});

test("rate limit: 61st save within the hour is refused", async () => {
  await admin("delete from public.rate_limits");
  const a = await user(next());
  for (let i = 0; i < 60; i++) await set(a, "schueler", 1, i % 2 ? "completed" : "skipped");
  assert.match(await code(set(a, "schueler", 1, "completed")), /rate_limited/);
});

test("RLS policy uses (select auth.uid()) (initplan perf rule)", async () => {
  const [p] = await admin("select qual from pg_policies where tablename = 'product_tour_state'");
  assert.match(p.qual, /SELECT auth\.uid\(\)/i);
});
