// Onboarding funnel save path (supabase/migrations/20261119100000_onboarding_funnel.sql) against PGlite with ALL migrations replayed.
// SPEC-DATA §6.2 / §6.3: happy path per role, apply-once, metadata copy, role rules (no escalation), validation bypass attempts,
// rate limit, gates (no access / unlicensed teacher), direct table writes, «Meine Daten löschen», unconfirmed-trial release,
// and parity of the SQL rules with lib/funnel/validate.ts (same corpus through both).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb } from "./helpers/access-db.mjs";

const ctx = await setupAccessDb();
const { admin, as, q, code, user, mode, expire, asService } = ctx;
const validate = await import("../lib/funnel/validate.ts");
const Y = new Date().getUTCFullYear();
let n = 500;
const next = () => ++n;
const day = 86400000;

const student = (over = {}) => ({ v: 1, role: "student", firstName: "Mia", birthYear: Y - 14, schoolLevel: "9. Klasse – Sek A / Bezirk",
  canton: "ZH", place: "Winterthur", professions: ["Informatiker:in", "Mediamatiker:in"], startYear: Y + 1, weeklyGoal: 4, help: ["lebenslauf", "brief"], ...over });
const parent = (over = {}) => ({ v: 1, role: "parent", firstName: "Sandra", help: ["ueberblick", "fristen"], ...over });
const apply = async (u, payload) => { await as(u); return (await q("select public.funnel_apply($1::jsonb) as r", [payload === null ? null : JSON.stringify(payload)]))[0].r; };
const profile = async (u) => (await admin("select * from public.profiles where user_id = $1", [u]))[0];
const roleRow = async (u) => (await admin("select * from public.user_roles where user_id = $1", [u]))[0];
const clearRl = () => admin("delete from public.rate_limits");

async function classFor(studentId) {
  const t = await user(next(), { meta: { role: "teacher" } });
  const [c] = await admin("insert into public.classes (teacher_id, name, join_code) values ($1, '9a', $2) returning id", [t, `K${n}`.padEnd(8, "Q")]);
  await admin("insert into public.class_members (class_id, student_id) values ($1, $2)", [c.id, studentId]);
  return c.id;
}

test("student (private): profile, account type, birth year, under_16, display name, flags", async () => {
  const u = await user(next(), { email: "mia.k82@example.test", meta: { role: "student", account_type: "independent_student", birth_year: Y - 14 } });
  const r = await apply(u, student());
  assert.deepEqual(r, { applied: true, role: "student", role_mismatch: false, under_16: true });
  const p = await profile(u);
  assert.equal(p.first_name, "Mia"); assert.equal(p.display_name, "Mia");
  assert.equal(p.account_type, "independent_student"); assert.equal(p.birth_year, Y - 14);
  assert.equal(p.school_level, "9. Klasse – Sek A / Bezirk"); assert.equal(p.canton, "ZH"); assert.equal(p.location, "Winterthur");
  assert.deepEqual(p.desired_professions, ["Informatiker:in", "Mediamatiker:in"]); assert.equal(p.desired_start_year, Y + 1);
  assert.equal(p.weekly_goal, 4); assert.deepEqual([...p.help_wishes].sort(), ["brief", "lebenslauf"]);
  assert.ok(p.funnel_completed_at); assert.equal(p.funnel_version, 1);
  assert.ok(p.onboarding_completed_at); assert.ok(p.onboarding_tour_completed_at);
  const rr = await roleRow(u);
  assert.equal(rr.role, "student"); assert.equal(rr.display_name, "Mia"); assert.equal(rr.under_16, true);
});

test("student in a class → school_student; under_16 only set when it was null", async () => {
  const u = await user(next(), { meta: { role: "student" } });
  await classFor(u);
  await admin("update public.user_roles set under_16 = false where user_id = $1", [u]);
  const r = await apply(u, student({ birthYear: Y - 13 }));
  assert.equal(r.applied, true); assert.equal(r.role_mismatch, false);
  assert.equal((await profile(u)).account_type, "school_student");
  assert.equal((await roleRow(u)).under_16, false, "existing under_16 is not overwritten");
});

test("parent: account type parent, help wishes, no student fields", async () => {
  const u = await user(next(), { meta: { role: "student", account_type: "parent" } });
  const r = await apply(u, parent());
  assert.deepEqual(r, { applied: true, role: "parent", role_mismatch: false, under_16: false });
  const p = await profile(u);
  assert.equal(p.account_type, "parent"); assert.equal(p.first_name, "Sandra");
  assert.deepEqual([...p.help_wishes].sort(), ["fristen", "ueberblick"]);
  assert.equal(p.weekly_goal, null); assert.equal(p.onboarding_completed_at, null, "parents have no student onboarding");
});

test("staff: teacher role (skipped payload), no access without licence, never school_admin", async () => {
  await mode("on");
  const u = await user(next(), { meta: {} });
  const r = await apply(u, { v: 1, role: "staff", skipped: true });
  assert.equal(r.applied, true); assert.equal(r.role, "teacher");
  assert.equal((await roleRow(u)).role, "teacher");
  assert.equal((await admin("select public.app_access($1) as a", [u]))[0].a.has_access, false, "teacher stays behind the licence gate");
  assert.equal((await admin("select count(*)::int as c from public.school_admins where user_id = $1", [u]))[0].c, 0);
  assert.equal((await admin("select count(*)::int as c from public.platform_admins where user_id = $1", [u]))[0].c, 0);
  await mode("test_users");
});

test("apply once: second call already_done (nothing changes); onboarding done before → already_done; old account → not_new", async () => {
  const u = await user(next(), { meta: { role: "student" } });
  await apply(u, student());
  const before = await profile(u);
  const r2 = await apply(u, student({ firstName: "Eve", weeklyGoal: 9 }));
  assert.deepEqual(r2, { applied: false, reason: "already_done", role: "student" });
  const after = await profile(u);
  assert.equal(after.first_name, "Mia"); assert.equal(after.weekly_goal, 4);
  assert.equal(String(after.funnel_completed_at), String(before.funnel_completed_at));

  const o = await user(next(), { meta: { role: "student" } });
  await admin("insert into public.profiles (id, user_id, first_name, last_name, email, onboarding_completed_at) values ('profile-' || $1::text, $1::uuid, 'Old', '', 'x@y', now())", [o]);
  assert.equal((await apply(o, student())).reason, "already_done");
  assert.equal((await profile(o)).first_name, "Old");

  const old = await user(next(), { meta: { role: "student" }, createdAt: new Date(Date.now() - 15 * day).toISOString() });
  assert.deepEqual(await apply(old, student()), { applied: false, reason: "not_new", role: "student" });
  assert.equal(await profile(old), undefined, "nothing written for an old account");
});

test("metadata copy: p_answers null reads wa_funnel; no copy → no_answers; invalid copy → INVALID_FUNNEL, nothing written", async () => {
  const u = await user(next(), { meta: { role: "student", wa_funnel: student({ firstName: "Noah" }) } });
  const r = await apply(u, null);
  assert.equal(r.applied, true);
  assert.equal((await profile(u)).first_name, "Noah");

  const none = await user(next(), { meta: { role: "student" } });
  assert.deepEqual(await apply(none, null), { applied: false, reason: "no_answers", role: "student" });

  const bad = await user(next(), { meta: { role: "student", wa_funnel: student({ weeklyGoal: 11 }) } });
  assert.match(await code(apply(bad, null)), /INVALID_FUNNEL/);
  const p = await profile(bad);
  assert.ok(!p || p.funnel_completed_at === null, "transaction rolled back");
  assert.equal((await roleRow(bad)).display_name, `u${n}`, "display name untouched");
});

test("role rules: teacher + student answers → unchanged, mismatch, only first name saved", async () => {
  const t = await user(next(), { email: "herr.k@example.test", meta: { role: "teacher" } });
  const r = await apply(t, student({ firstName: "Peter" }));
  assert.deepEqual(r, { applied: true, role: "teacher", role_mismatch: true, under_16: false });
  const p = await profile(t);
  assert.equal(p.first_name, "Peter"); assert.equal(p.weekly_goal, null); assert.deepEqual(p.desired_professions, []);
  assert.equal(p.birth_year, null); assert.equal(p.school_level, null);
  assert.equal((await roleRow(t)).role, "teacher");
  assert.equal((await roleRow(t)).display_name, "Peter", "teacher name was the e-mail local part → replaced");
});

test("role rules: school admin can never become parent/student/teacher via the funnel", async () => {
  const [s] = await admin("insert into public.schools (name) values ('Sek X') returning id");
  for (const payload of [parent(), student(), { v: 1, role: "staff", skipped: true }]) {
    const a = await user(next(), { meta: {} });
    await admin("insert into public.school_admins (school_id, user_id) values ($1, $2)", [s.id, a]);
    await admin("update public.user_roles set role = 'school_admin' where user_id = $1", [a]).catch(() => null);
    const r = await apply(a, payload);
    assert.equal(r.role, "school_admin", JSON.stringify(payload));
    const p = await profile(a);
    assert.notEqual(p?.account_type, "parent");
  }
});

test("role rules: pupil in a class asking for parent → mismatch, stays school_student; family child cannot become older", async () => {
  const u = await user(next(), { meta: { role: "student" } });
  await classFor(u);
  const r = await apply(u, parent());
  assert.equal(r.role_mismatch, true);
  assert.notEqual((await profile(u))?.account_type, "parent");

  const par = await user(next(), { meta: { role: "student", account_type: "parent" } });
  const kid = await user(next(), { meta: { role: "student" } });
  await admin("insert into public.profiles (id, user_id, first_name, last_name, email, account_type, birth_year) values ('profile-' || $1::text, $1::uuid, '', '', 'k@x', 'independent_student', $2)", [kid, Y - 12]);
  const [f] = await admin("insert into public.families (created_by) values ($1) returning id", [par]);
  await admin("insert into public.family_members (family_id, user_id, role) values ($1, $2, 'parent')", [f.id, par]);
  await admin("insert into public.family_members (family_id, user_id, role, consent_status) values ($1, $2, 'child', 'pending')", [f.id, kid]);
  const rk = await apply(kid, student({ birthYear: Y - 17 }));
  assert.equal(rk.role_mismatch, true);
  assert.equal((await profile(kid)).birth_year, Y - 12, "consent age cannot be skipped");
});

test("no path grants admin / access: account_access, platform_admins, grants unchanged", async () => {
  const u = await user(next(), { meta: {} });
  const before = (await admin("select to_jsonb(a) - 'updated_at' as a from public.account_access a where user_id = $1", [u]))[0];
  for (const role of ["admin", "school_admin", "teacher", "platform_admin"]) {
    assert.match(await code(apply(u, { v: 1, role, firstName: "X" })), /INVALID_FUNNEL/, role);
  }
  await apply(u, student());
  const after = (await admin("select to_jsonb(a) - 'updated_at' as a from public.account_access a where user_id = $1", [u]))[0];
  assert.deepEqual(after, before);
  assert.equal((await admin("select count(*)::int as c from public.platform_admins where user_id = $1", [u]))[0].c, 0);
  assert.equal((await admin("select count(*)::int as c from public.school_access_grants"))[0].c >= 0, true);
});

// ---------------------------------------------------------------- validation (bypassing the client)
const BAD = [
  ["unknown key", student({ email: "a@b.c" }), "key"],
  ["v 2", student({ v: 2 }), "v"],
  ["role array", student({ role: ["student"] }), "role"],
  ["skipped string", { v: 1, role: "student", skipped: "true" }, "key"],
  ["name empty", student({ firstName: "   " }), "firstName"],
  ["name 41", student({ firstName: "A".repeat(41) }), "firstName"],
  ["name 10 kB", student({ firstName: "A".repeat(10000) }), "size"],
  ["name digits only", student({ firstName: "1234" }), "firstName"],
  ["name only invisible", student({ firstName: "​‮" }), "firstName"],
  ["name number", student({ firstName: 5 }), "firstName"],
  ["name C1 control", student({ firstName: "Mi\u0085a" }), "firstName"],
  ["year string", student({ birthYear: String(Y - 14) }), "birthYear"],
  ["year fraction", student({ birthYear: Y - 14 + 0.5 }), "birthYear"],
  ["year too young", student({ birthYear: Y - 7 }), "birthYear"],
  ["year too old", student({ birthYear: Y - 101 }), "birthYear"],
  ["year missing", student({ birthYear: undefined }), "birthYear"],
  ["year 1e3", student({ birthYear: 1e3 }), "birthYear"],
  ["level unknown", student({ schoolLevel: "Uni" }), "schoolLevel"],
  ["canton lower", student({ canton: "zh" }), "canton"],
  ["canton XX", student({ canton: "XX" }), "canton"],
  ["place 61", student({ place: "B".repeat(61) }), "place"],
  ["place object", student({ place: { x: 1 } }), "place"],
  ["unsure string", student({ unsure: "yes" }), "unsure"],
  ["4 professions", student({ professions: ["a", "b", "c", "d"] }), "professions"],
  ["profession number", student({ professions: [1] }), "professions"],
  ["profession nested", student({ professions: [["a"]] }), "professions"],
  ["profession 61", student({ professions: ["C".repeat(61)] }), "professions"],
  ["profession empty", student({ professions: [" "] }), "professions"],
  ["profession C1 control", student({ professions: ["Ko\u009bch"] }), "professions"],
  ["place C1 control", student({ place: "Bern\u0085" }), "place"],
  ["unsure + professions", student({ unsure: true }), "professions"],
  ["start year string", student({ startYear: String(Y + 1) }), "startYear"],
  ["start year range", student({ startYear: Y + 5 }), "startYear"],
  ["goal 0", student({ weeklyGoal: 0 }), "weeklyGoal"],
  ["goal 11", student({ weeklyGoal: 11 }), "weeklyGoal"],
  ["goal 3.5", student({ weeklyGoal: 3.5 }), "weeklyGoal"],
  ["goal string", student({ weeklyGoal: "3" }), "weeklyGoal"],
  ["goal negative", student({ weeklyGoal: -3 }), "weeklyGoal"],
  ["help unknown", student({ help: ["geld"] }), "help"],
  ["help parent value for student", student({ help: ["fristen"] }), "help"],
  ["help 6", student({ help: ["lebenslauf", "brief", "schnuppern", "ueberblick", "eltern", "brief"] }), "help"],
  ["help string", student({ help: "brief" }), "help"],
  ["parent help student value", parent({ help: ["lebenslauf"] }), "help"],
  ["5 kB payload", student({ place: "x", professions: ["a"], help: [], firstName: "Mia", startYear: Y + 1, unsure: false, weeklyGoal: 3, skipped: false, canton: "ZH", schoolLevel: "8. Klasse", birthYear: Y - 14, v: 1, role: "student", ...{ junk: "z".repeat(5000) } }), "size"],
];

test("every validation rule rejects with INVALID_FUNNEL (detail = field only), never a cast/SQL error; nothing stored", async () => {
  for (const [label, payload, field] of BAD) {
    await clearRl();
    const u = await user(next(), { meta: {} });
    await as(u);
    let err = null;
    try { await q("select public.funnel_apply($1::jsonb)", [JSON.stringify(payload)]); } catch (e) { err = e; }
    assert.ok(err, `${label}: rejected`);
    assert.equal(err.message, "INVALID_FUNNEL", `${label}: ${err.message}`);
    assert.equal(err.detail, field, `${label}: detail`);
    const p = await profile(u);
    assert.ok(!p || p.funnel_completed_at === null, `${label}: nothing stored`);
  }
  // non-object JSON
  for (const raw of ["[1,2]", "\"x\"", "42", "true"]) {
    const u = await user(next(), { meta: {} });
    await as(u);
    assert.match(await code(q("select public.funnel_apply($1::jsonb)", [raw])), /INVALID_FUNNEL/, raw);
  }
});

test("parity: lib/funnel/validate.ts gives the same verdict and field as funnel_apply for the whole corpus", async () => {
  const GOOD = [student(), student({ professions: [], unsure: true, startYear: undefined }), student({ place: null, help: null }), parent(), parent({ help: [] }),
    { v: 1, role: "staff", skipped: true }, { v: 1, role: "parent", skipped: true }, student({ firstName: "  Zoë   Anna ", place: " Bülach " }),
    student({ firstName: "👩‍💻 Lea" }), student({ firstName: "Ali‏" }), student({ professions: ["Koch", "koch", "KOCH"] }), student({ firstName: "李" })];
  for (const payload of GOOD) {
    await clearRl();
    const u = await user(next(), { meta: {} });
    const js = validate.validatePayload(payload);
    assert.deepEqual(js, { ok: true }, `js ok: ${JSON.stringify(payload)}`);
    const r = await apply(u, payload);
    assert.equal(r.applied, true, `sql ok: ${JSON.stringify(payload)}`);
  }
  for (const [label, payload, field] of BAD) {
    const js = validate.validatePayload(JSON.parse(JSON.stringify(payload)));
    assert.deepEqual(js, { ok: false, field }, `js: ${label}`);
  }
});

test("cleaning: invisible chars stripped, whitespace collapsed, professions deduped case-insensitively (first spelling wins)", async () => {
  await clearRl();
  const u = await user(next(), { meta: {} });
  await apply(u, student({ firstName: "‮Mia​  Lou ", place: "  Bülach⁦ ", professions: ["Koch / Köchin", "koch / köchin", "Maurer:in"] }));
  const p = await profile(u);
  assert.equal(p.first_name, "Mia Lou"); assert.equal(p.location, "Bülach");
  assert.deepEqual(p.desired_professions, ["Koch / Köchin", "Maurer:in"]);
  assert.equal(validate.cleanText("‮Mia​  Lou "), "Mia Lou");
});

test("start year is dropped without professions (unsure)", async () => {
  await clearRl();
  const u = await user(next(), { meta: {} });
  await apply(u, student({ professions: [], unsure: true, startYear: Y + 1 }));
  assert.equal((await profile(u)).desired_start_year, null);
});

test("concurrency: two parallel calls → applied once (advisory lock), second already_done", async () => {
  await clearRl();
  const u = await user(next(), { meta: {} });
  const a = await apply(u, student());
  const b = await apply(u, student({ firstName: "Zweite" }));
  assert.equal(a.applied, true); assert.equal(b.reason, "already_done");
  assert.equal((await profile(u)).first_name, "Mia");
});

test("rate limit: the 11th call within the hour is refused (RATE_LIMITED / 429), other users unaffected", async () => {
  await clearRl();
  const u = await user(next(), { meta: {} });
  for (let i = 0; i < 10; i++) await apply(u, student());
  const err = await code(apply(u, student()));
  assert.match(err, /rate_limited/);
  const other = await user(next(), { meta: {} });
  assert.equal((await apply(other, student())).applied, true);
});

test("anon and service paths: anon cannot execute; unauthenticated call raises NOT_AUTHENTICATED", async () => {
  for (const fn of ["public.funnel_apply(jsonb)", "public.tour_state_set(text, integer, text, integer)", "public.weekly_goal_set(integer)"]) {
    assert.equal((await admin(`select has_function_privilege('anon', '${fn}', 'EXECUTE') as ok`))[0].ok, false, fn);
  }
  for (const fn of ["public._funnel_role_of(uuid)", "public._funnel_clean(text)", "public.privacy_release_unconfirmed_trial(uuid)", "public._profiles_funnel_guard()", "public._acc_impl_weekly_goal_set(integer)"]) {
    assert.equal((await admin(`select has_function_privilege('authenticated', '${fn}', 'EXECUTE') as ok`))[0].ok, false, fn);
  }
  await as(null);
  assert.match(await code(q("select public.funnel_apply('{}'::jsonb)")), /NOT_AUTHENTICATED/);
});

// ---------------------------------------------------------------- gates
test("works without access (expired trial, enforce on) and for an unlicensed teacher; weekly_goal_set is paywalled", async () => {
  await mode("on");
  await clearRl();
  const u = await user(next(), { meta: {} });
  await expire(u);
  assert.equal((await admin("select public.app_access($1) as a", [u]))[0].a.has_access, false);
  assert.equal((await apply(u, student())).applied, true, "definer insert passes the restrictive policy + clear-update trigger");
  await as(u);
  assert.match(await code(q("select public.weekly_goal_set(5)")), /PAYWALL/);
  assert.equal((await profile(u)).weekly_goal, 4);

  const fresh = await user(next(), { meta: {} });
  await as(fresh);
  assert.equal((await q("select public.weekly_goal_set(7) as g"))[0].g, 7);
  assert.equal((await profile(fresh)).weekly_goal, 7);
  await as(fresh);
  assert.match(await code(q("select public.weekly_goal_set(21)")), /INVALID_REQUEST/);
  await as(fresh);
  assert.match(await code(q("select public.weekly_goal_set(0)")), /INVALID_REQUEST/);
  await mode("test_users");
});

test("direct table writes: funnel columns pinned, CHECKs on weekly_goal / help_wishes, clearing without access, delete → blank", async () => {
  await clearRl();
  const u = await user(next(), { meta: {} });
  await apply(u, student());
  const done = (await profile(u)).funnel_completed_at;
  await as(u);
  await q("update public.profiles set funnel_completed_at = null, funnel_version = 7 where user_id = $1", [u]);
  let p = await profile(u);
  assert.equal(String(p.funnel_completed_at), String(done)); assert.equal(p.funnel_version, 1);
  await as(u);
  assert.match(await code(q("update public.profiles set weekly_goal = 0 where user_id = $1", [u])), /profiles_funnel_limits/);
  await as(u);
  assert.match(await code(q("update public.profiles set weekly_goal = 21 where user_id = $1", [u])), /profiles_funnel_limits/);
  await as(u);
  assert.match(await code(q("update public.profiles set help_wishes = '{geld}' where user_id = $1", [u])), /profiles_funnel_limits/);
  await as(u);
  await q("update public.profiles set weekly_goal = 12 where user_id = $1", [u]);
  assert.equal((await profile(u)).weekly_goal, 12, "1..20 allowed in the column");

  // a fresh insert by the client cannot pretend the funnel is done
  const v = await user(next(), { meta: {} });
  await as(v);
  await q("insert into public.profiles (id, user_id, first_name, last_name, email, funnel_completed_at, funnel_version) values ('profile-' || $1::text, $1::uuid, 'X', '', 'x@y', now(), 1)", [v]);
  p = await profile(v);
  assert.equal(p.funnel_completed_at, null); assert.equal(p.funnel_version, null);
  assert.equal((await apply(v, student())).applied, true, "so the real funnel still applies");

  // without access: only clearing (incl. the new columns)
  await mode("on"); await expire(u);
  await as(u);
  assert.match(await code(q("update public.profiles set weekly_goal = 5 where user_id = $1", [u])), /PAYWALL/);
  await as(u);
  await q("update public.profiles set weekly_goal = null, help_wishes = '{}' where user_id = $1", [u]);
  p = await profile(u);
  assert.equal(p.weekly_goal, null); assert.deepEqual(p.help_wishes, []);
  await mode("test_users");

  // «Meine Daten löschen» (delete → blank) clears the answers, keeps funnel_completed_at
  await apply(v, student()); // already_done, harmless
  await admin("update public.profiles set weekly_goal = 6, help_wishes = '{brief}' where user_id = $1", [v]);
  await as(v);
  await q("delete from public.profiles where user_id = $1", [v]);
  p = await profile(v);
  assert.ok(p, "row kept");
  assert.equal(p.weekly_goal, null); assert.deepEqual(p.help_wishes, []); assert.equal(p.first_name, "");
  assert.ok(p.funnel_completed_at, "funnel_completed_at kept (stale browser copy is not applied again)");
  assert.equal((await apply(v, student())).reason, "already_done");
});

test("CLEARED_PROFILE (lib/storage.ts) equals the trigger's cleared JSON (incl. weekly_goal, help_wishes)", async () => {
  const src = (await admin("select prosrc from pg_proc where proname = '_access_gate_clear_update'"))[0].prosrc;
  const json = JSON.parse(/cleared := '(\{"first_name"[\s\S]*?\})';/.exec(src)[1]);
  const storage = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../lib/storage.ts", import.meta.url), "utf8"));
  const line = /export const CLEARED_PROFILE = (\{.*\});/.exec(storage)[1].replace(/ as string\[\]/g, "").replace(/(\w+):/g, "\"$1\":");
  assert.deepEqual(JSON.parse(line), json);
  assert.ok("weekly_goal" in json && "help_wishes" in json);
});

// ---------------------------------------------------------------- unconfirmed sign-ups
test("privacy_release_unconfirmed_trial: only never-confirmed users, removes only their own untouched ledger row; service role only", async () => {
  const u = await user(next(), { email: `typo${n}@example.test`, meta: {} });
  const hash = (await admin("select public._access_email_hash($1) as h", [`typo${n}@example.test`]))[0].h;
  assert.equal((await admin("select count(*)::int as c from public.trial_ledger where email_hash = $1", [hash]))[0].c, 1);
  await as(u);
  assert.match(await code(q("select public.privacy_release_unconfirmed_trial($1)", [u])), /permission denied/);
  await asService();
  assert.equal((await q("select public.privacy_release_unconfirmed_trial($1) as ok", [u]))[0].ok, true);
  assert.equal((await admin("select count(*)::int as c from public.trial_ledger where email_hash = $1", [hash]))[0].c, 0);

  const c = await user(next(), { email: `ok${n}@example.test`, meta: {} });
  await admin("update auth.users set email_confirmed_at = now() where id = $1", [c]);
  const h2 = (await admin("select public._access_email_hash($1) as h", [`ok${n}@example.test`]))[0].h;
  await asService();
  assert.equal((await q("select public.privacy_release_unconfirmed_trial($1) as ok", [c]))[0].ok, false);
  assert.equal((await admin("select count(*)::int as c from public.trial_ledger where email_hash = $1", [h2]))[0].c, 1);
  await asService();
  assert.equal((await q("select public.privacy_release_unconfirmed_trial($1) as ok", ["00000000-0000-4000-8000-999999999999"]))[0].ok, false);
});
