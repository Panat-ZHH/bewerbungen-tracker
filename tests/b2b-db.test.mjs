// B2B data layer (supabase/migrations/20261116*): schools, licences + seat limit, school admins, class goals,
// class statistics, data export and the RLS / privilege audit. Runs every migration in order on PGlite.
import assert from "node:assert/strict";
import { test, before } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = {
  teacher: id(1), teacher2: id(2), admin: id(3), otherAdmin: id(4), privateTeacher: id(5),
  a: id(11), b: id(12), c: id(13), d: id(14), e: id(15), f: id(16), g: id(17),
};
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

let ctx; // shared database (tests below run in file order)
// Service role: no JWT subject (auth.uid() is null), superuser privileges.
const svc = async (sql, params) => { await ctx.as(null); return ctx.admin(sql, params); };
const err = async (promise) => { try { await promise; return null; } catch (e) { return e; } };

async function app(user, appId, status, extra = {}) {
  await ctx.admin(
    `insert into public.applications (id,user_id,company,position,location,category,status,deadline,applied_at,created_at,updated_at,notes,schnupper_date)
     values ($1,$2,$3,'Lernende/r','Zürich','informatik',$4,$5,$6,$7,$7,'GEHEIME NOTIZ',$8)`,
    [appId, user, extra.company ?? `Firma-${appId}`, status, extra.deadline ?? null, extra.applied ?? null, extra.created ?? day(-2), extra.schnupper ?? null]);
}

before(async () => {
  ctx = await setupTeacherDb({ seed: false });
  const users = Object.entries(U).map(([k, v]) => `('${v}','${k}@x.ch','${JSON.stringify({ full_name: k.toUpperCase(), role: k.toLowerCase().includes("teacher") ? "teacher" : "student" })}')`);
  await ctx.admin(`insert into auth.users values ${users.join(",")}`);
  // Students are 16+ so sharing starts ON (except where a test switches it off).
  await ctx.admin("update public.user_roles set under_16 = false where role = 'student'");
});

let school, schoolPilot, cls, cls2, privateCls, pilotCls;

test("schema: tables, role check, classes.school_id nullable and existing classes untouched", async () => {
  const tables = (await ctx.admin("select table_name from information_schema.tables where table_schema='public'")).map((r) => r.table_name);
  for (const t of ["schools", "school_licences", "school_admins", "class_goals"]) assert.ok(tables.includes(t), t);
  const col = (await ctx.admin("select is_nullable from information_schema.columns where table_name='classes' and column_name='school_id'"))[0];
  assert.equal(col.is_nullable, "YES");
  assert.ok(await ctx.code(ctx.admin(`update public.user_roles set role='hacker' where user_id=$1`, [U.a])));
  assert.equal(await ctx.code(ctx.admin(`insert into public.schools (name, country) values ('X', 'FR')`)) !== null, true, "country check");
});

test("platform admin: school + licence defaults (limits from package, pilot_end = start + 30)", async () => {
  [{ platform_create_school: school }] = await ctx.admin("select public.platform_create_school('Sek Uster', 'ZH', 'CH')");
  [{ platform_create_school: schoolPilot }] = await ctx.admin("select public.platform_create_school('Sek Pilot', 'Bayern', 'DE')");
  await ctx.admin("select public.platform_assign_licence($1, 'custom', 'active', 3)", [school]);
  await ctx.admin("select public.platform_assign_licence($1, 'pilot', null, null, $2::date)", [schoolPilot, day(-40)]);
  const pilot = (await ctx.admin("select * from public.school_licences where school_id=$1", [schoolPilot]))[0];
  assert.equal(pilot.status, "pilot");
  assert.equal(pilot.student_limit, 60);
  assert.equal(pilot.pilot_end.toISOString().slice(0, 10), day(-10));
  const [{ id: proId }] = await ctx.admin("insert into public.school_licences (school_id, package) values ($1, 'professional') returning id", [schoolPilot]);
  assert.equal((await ctx.admin("select student_limit from public.school_licences where id=$1", [proId]))[0].student_limit, 300);
  await ctx.admin("delete from public.school_licences where id=$1", [proId]);
  assert.match(String(await ctx.code(ctx.admin("insert into public.school_licences (school_id, package) values ($1, 'custom')", [school]))), /LICENCE_LIMIT_REQUIRED/);
  await ctx.admin("select public.platform_add_school_admin($1, 'admin@x.ch', true)", [school]);
  await ctx.admin("select public.platform_add_school_admin($1, 'otheradmin@x.ch', true)", [schoolPilot]);
  assert.equal((await ctx.admin("select role from public.user_roles where user_id=$1", [U.admin]))[0].role, "school_admin");
});

test("roles: school_admin cannot be self-assigned and a school admin cannot switch role", async () => {
  await ctx.as(U.g);
  assert.match(await ctx.code(ctx.rpc("select public.set_my_role('school_admin')")), /INVALID_REQUEST/);
  await ctx.as(U.admin);
  assert.match(await ctx.code(ctx.rpc("select public.set_my_role('teacher')")), /FORBIDDEN/);
  assert.match(await ctx.code(ctx.rpc("select public.set_my_role('student')")), /FORBIDDEN/);
});

test("classes: teacher creates classes, school admin attaches by join code, private class stays licence-free", async () => {
  await ctx.as(U.teacher);
  [cls] = await ctx.rpc("select * from public.class_create('3a', '2026/27')");
  [cls2] = await ctx.rpc("select * from public.class_create('3b', '2026/27')");
  await ctx.as(U.teacher2);
  [pilotCls] = await ctx.rpc("select * from public.class_create('Pilotklasse', '2026/27')");
  await ctx.as(U.privateTeacher);
  [privateCls] = await ctx.rpc("select * from public.class_create('Privat', '')");

  await ctx.as(U.admin);
  const [att] = await ctx.rpc("select * from public.school_attach_class($1, $2)", [school, cls.join_code]);
  assert.equal(att.class_id, cls.id);
  await ctx.rpc("select * from public.school_attach_class($1, $2)", [school, cls2.join_code]);
  assert.match(await ctx.code(ctx.rpc("select * from public.school_attach_class($1, $2)", [schoolPilot, privateCls.join_code])), /FORBIDDEN/, "not admin of that school");
  assert.match(await ctx.code(ctx.rpc("select * from public.school_attach_class($1, 'NOPE1234')", [school])), /CLASS_NOT_FOUND/);
  await ctx.as(U.otherAdmin);
  assert.match(await ctx.code(ctx.rpc("select * from public.school_attach_class($1, $2)", [schoolPilot, cls.join_code])), /CLASS_IN_OTHER_SCHOOL/);
  await ctx.rpc("select * from public.school_attach_class($1, $2)", [schoolPilot, pilotCls.join_code]); // empty class: no seat needed
  // teachers cannot set school_id themselves
  await ctx.as(U.privateTeacher);
  assert.ok(await ctx.code(ctx.rpc("update public.classes set school_id=$1 where id=$2", [school, privateCls.id])));
});

test("licence limit trigger: 3 seats, 4th student gets WA001 with a German message; re-join and second class need no seat", async () => {
  for (const s of [U.a, U.b, U.c]) { await ctx.as(s); await ctx.rpc("select * from public.class_join($1)", [cls.join_code]); }
  await ctx.as(U.d);
  const e = await err(ctx.rpc("select * from public.class_join($1)", [cls.join_code]));
  assert.ok(e, "4th join must fail");
  assert.equal(e.code, "WA001");
  assert.match(e.message, /LICENCE_LIMIT_REACHED/);
  assert.match(e.detail, /Schullizenz ist voll \(3 von 3/);
  assert.doesNotMatch(e.detail, /ß/);
  // re-join (insert ... on conflict do nothing) and joining the second class of the same school
  await ctx.as(U.a);
  await ctx.rpc("select * from public.class_join($1)", [cls.join_code]);
  await ctx.rpc("select * from public.class_join($1)", [cls2.join_code]);
  assert.equal((await svc("select public.school_student_count($1) as n", [school]))[0].n, 3);
  // invitations go through the same trigger
  await ctx.as(U.teacher);
  const [inv] = await ctx.rpc("select * from public.class_invite_create($1)", [cls2.id]);
  await ctx.as(U.d);
  assert.equal((await err(ctx.rpc("select * from public.class_invite_accept($1)", [inv.token]))).code, "WA001");
  // private class (no school): unlimited, exactly as before
  for (const s of [U.d, U.e, U.f]) { await ctx.as(s); await ctx.rpc("select * from public.class_join($1)", [privateCls.join_code]); }
  assert.equal((await ctx.admin("select count(*)::int as n from public.class_members where class_id=$1", [privateCls.id]))[0].n, 3);
});

test("attaching a class whose members exceed the seats fails and leaves the class unattached", async () => {
  await ctx.as(U.admin);
  const e = await err(ctx.rpc("select * from public.school_attach_class($1, $2)", [school, privateCls.join_code]));
  assert.equal(e?.code, "WA001");
  assert.equal((await ctx.admin("select school_id from public.classes where id=$1", [privateCls.id]))[0].school_id, null);
});

test("archiving frees seats; un-archiving re-checks them", async () => {
  await ctx.as(U.teacher);
  await ctx.rpc("select public.class_set_archived($1, true)", [cls.id]);
  assert.equal((await svc("select public.school_student_count($1) as n", [school]))[0].n, 1, "only A (also in 3b) still counted");
  await ctx.as(U.g);
  await ctx.rpc("select * from public.class_join($1)", [cls2.join_code]);
  await ctx.as(U.e);
  await ctx.rpc("select * from public.class_join($1)", [cls2.join_code]); // A, G, E = 3
  await ctx.as(U.teacher);
  assert.equal((await err(ctx.rpc("select public.class_set_archived($1, false)", [cls.id]))).code, "WA001");
  await ctx.admin("delete from public.class_members where class_id=$1 and student_id=$2", [cls2.id, U.e]);
  await ctx.admin("delete from public.class_members where class_id=$1 and student_id=$2", [cls2.id, U.g]);
  await ctx.rpc("select public.class_set_archived($1, false)", [cls.id]);
  assert.equal((await svc("select public.school_student_count($1) as n", [school]))[0].n, 3);
});

test("pilot expiry: joining a class of a school whose pilot ended raises WA002; missing licence WA003", async () => {
  await ctx.as(U.f);
  const e = await err(ctx.rpc("select * from public.class_join($1)", [pilotCls.join_code]));
  assert.equal(e?.code, "WA002");
  assert.match(e.message, /LICENCE_EXPIRED/);
  assert.match(e.detail, /Pilotphase/);
  await ctx.as(U.otherAdmin);
  const [s] = await ctx.rpc("select * from public.school_admin_my_schools()");
  assert.equal(s.licence.state, "expired");
  // a fresh pilot makes it usable again
  await ctx.admin("select public.platform_assign_licence($1, 'pilot')", [schoolPilot]);
  await ctx.as(U.f);
  await ctx.rpc("select * from public.class_join($1)", [pilotCls.join_code]);
  const [{ platform_create_school: empty }] = await ctx.admin("select public.platform_create_school('Ohne Lizenz')");
  await ctx.admin("update public.classes set school_id=null where id=$1", [pilotCls.id]);
  assert.equal((await err(ctx.admin("update public.classes set school_id=$1 where id=$2", [empty, pilotCls.id]))).code, "WA003");
  await ctx.admin("update public.classes set school_id=$1 where id=$2", [schoolPilot, pilotCls.id]);
});

test("generic _licence_state covers every status", async () => {
  const st = async (...a) => (await ctx.admin("select public._licence_state($1,$2::date,$3::date,$4::date) as s", a))[0].s;
  assert.equal(await st("pilot", day(5), null, null), "pilot");
  assert.equal(await st("pilot", day(-1), null, null), "expired");
  assert.equal(await st("active", null, day(-10), day(10)), "active");
  assert.equal(await st("active", null, day(3), day(300)), "not_started");
  assert.equal(await st("active", null, day(-400), day(-1)), "expired");
  assert.equal(await st("cancelled", null, null, null), "cancelled");
  assert.equal(await st("expired", null, null, null), "expired");
});

test("seed applications", async () => {
  // A: 3 sent (2 rejected... + 1 interview), B: nothing, C: old activity + trial day, A also has a deadline soon.
  await app(U.a, "a1", "rejected", { applied: day(-20) });
  await app(U.a, "a2", "rejected", { applied: day(-19) });
  await app(U.a, "a3", "rejected", { applied: day(-18) });
  await app(U.a, "a4", "interview", { applied: day(-5), company: "Geheim AG" });
  await app(U.a, "a5", "saved", { deadline: day(3) });
  await app(U.c, "c1", "applied", { applied: day(-40), created: day(-40), schnupper: day(-30) });
  await app(U.b, "b-hidden", "offer", { applied: day(-3) }); // B will hide everything
  await ctx.as(U.b);
  await ctx.rpc("select public.class_set_sharing_v2($1, false)", [cls.id]);
  await ctx.admin("insert into public.cvs (id,user_id,name,type,description,updated_at,status) values ('cv-b',$1,'CV B','lebenslauf','x',current_date,'Draft')", [U.b]);
  await ctx.admin("insert into public.ai_reviews (user_id, score, result, model, prompt_version) values ($1, 70, '{}', 'm', 'v1')", [U.b]);
  await ctx.admin("insert into public.calendar_feeds (user_id, token) values ($1, repeat('t', 40))", [U.a]);
});

test("students: never read other students' applications, documents, ai_reviews, profiles, roles", async () => {
  await ctx.admin("grant select, insert, update, delete on public.cvs, public.applications, public.profiles to authenticated");
  await ctx.admin("grant select, delete on public.ai_reviews to authenticated");
  await ctx.as(U.a);
  assert.deepEqual((await ctx.rpc("select user_id from public.applications group by user_id")).map((r) => r.user_id), [U.a]);
  assert.equal((await ctx.rpc("select * from public.cvs where user_id=$1", [U.b])).length, 0);
  assert.equal((await ctx.rpc("select * from public.ai_reviews")).length, 0);
  assert.equal((await ctx.rpc("select * from public.user_roles where user_id<>$1", [U.a])).length, 0);
  assert.equal((await ctx.rpc("select * from public.class_members where student_id<>$1", [U.a])).length, 0);
  assert.equal((await ctx.rpc("select * from public.schools")).length, 0, "students do not see schools");
  assert.equal((await ctx.rpc("select * from public.school_licences")).length, 0);
  assert.match(await ctx.code(ctx.rpc("select public.class_overview_stats($1)", [cls.id])), /FORBIDDEN/);
  assert.match(await ctx.code(ctx.rpc("select public.school_admin_overview($1)", [school])), /FORBIDDEN/);
  assert.match(await ctx.code(ctx.rpc("select public.school_student_count($1)", [school])), /FORBIDDEN/);
});

test("teacher: class_overview_stats has counts and support reasons, never company names, notes or hidden students' data", async () => {
  await ctx.as(U.teacher);
  const stats = (await ctx.rpc("select public.class_overview_stats($1) as s", [cls.id]))[0].s;
  const text = JSON.stringify(stats);
  for (const secret of ["Geheim AG", "GEHEIME NOTIZ", "Firma-", "Zürich"]) assert.ok(!text.includes(secret), secret);
  const by = Object.fromEntries(stats.students.map((s) => [s.display_name, s]));
  assert.equal(by.A.applications, 5);
  assert.deepEqual(by.A.status_counts, { rejected: 3, interview: 1, saved: 1 });
  assert.deepEqual([...by.A.reasons].sort(), ["many_rejections", "upcoming_deadline"]);
  assert.deepEqual(by.C.reasons, ["no_activity"]);
  assert.equal(by.B.hidden, true);
  assert.equal(by.B.applications, null);
  assert.equal(by.B.status_counts, null);
  assert.equal(by.B.placed, false, "hidden offer is not revealed");
  assert.deepEqual(by.B.reasons, []);
  assert.equal(stats.totals.students, 3);
  assert.equal(stats.totals.students_sharing, 2);
  assert.equal(stats.totals.applications, 6);
  assert.equal(stats.totals.status_counts.offer, undefined, "hidden student's offer is not in the aggregate");
  assert.equal(stats.totals.needs_support, 2);
  // B self-reports: only then B appears (with no other data)
  await ctx.as(U.b);
  await ctx.rpc("select public.class_set_self_report($1, true)", [cls.id]);
  await ctx.as(U.teacher);
  const again = (await ctx.rpc("select public.class_overview_stats($1) as s", [cls.id]))[0].s;
  assert.deepEqual(again.students.find((s) => s.display_name === "B").reasons, ["self_report"]);
  // another teacher may not
  await ctx.as(U.teacher2);
  assert.match(await ctx.code(ctx.rpc("select public.class_overview_stats($1)", [cls.id])), /FORBIDDEN/);
});

test("teacher: class_school_info shows school + licence, private class returns nulls", async () => {
  await ctx.as(U.teacher);
  const info = (await ctx.rpc("select public.class_school_info($1) as i", [cls.id]))[0].i;
  assert.equal(info.school.name, "Sek Uster");
  assert.equal(info.licence.student_limit, 3);
  assert.equal(info.licence.students_used, 3);
  assert.equal(info.licence.seats_left, 0);
  await ctx.as(U.privateTeacher);
  assert.deepEqual((await ctx.rpc("select public.class_school_info($1) as i", [privateCls.id]))[0].i, { school: null, licence: null });
});

test("school admin: own school, licence and aggregates only, small groups suppressed, no application details", async () => {
  await ctx.as(U.admin);
  const ov = (await ctx.rpc("select public.school_admin_overview($1) as o", [school]))[0].o;
  const text = JSON.stringify(ov);
  for (const secret of ["Geheim AG", "GEHEIME NOTIZ", "Firma-", "rejected", "interview", U.a, '"A"', '"B"']) assert.ok(!text.includes(secret), secret);
  assert.equal(ov.school.name, "Sek Uster");
  assert.equal(ov.licence.package, "custom");
  assert.equal(ov.licence.students_used, 3);
  assert.equal(ov.totals.students, 3);
  assert.equal(ov.totals.students_sharing, 2);
  assert.equal(ov.totals.suppressed, true, "only 2 sharing students -> numbers suppressed");
  assert.equal(ov.totals.applications, null);
  assert.equal(ov.teachers.length, 1);
  assert.equal(ov.teachers[0].display_name, "TEACHER");
  // with 3 sharing students the aggregate appears
  await ctx.as(U.b);
  await ctx.rpc("select public.class_set_sharing_v2($1, true, false, true)", [cls.id]);
  await ctx.as(U.admin);
  const ov2 = (await ctx.rpc("select public.school_admin_overview($1) as o", [school]))[0].o;
  assert.equal(ov2.totals.suppressed, false);
  assert.equal(ov2.totals.applications, 7);
  assert.equal(ov2.totals.students_placed, 1);
  await ctx.as(U.b);
  await ctx.rpc("select public.class_set_sharing_v2($1, false)", [cls.id]);
  // direct table reads: own school/licence/admin rows only; never applications, classes or memberships
  await ctx.as(U.admin);
  assert.deepEqual((await ctx.rpc("select id from public.schools")).map((r) => r.id), [school]);
  assert.ok((await ctx.rpc("select school_id from public.school_licences")).every((r) => r.school_id === school));
  assert.equal((await ctx.rpc("select * from public.applications")).length, 0);
  assert.equal((await ctx.rpc("select * from public.classes")).length, 0);
  assert.equal((await ctx.rpc("select * from public.class_members")).length, 0);
  assert.match(await ctx.code(ctx.rpc("select public.class_overview_stats($1)", [cls.id])), /FORBIDDEN/);
  assert.match(await ctx.code(ctx.rpc("select * from public.class_student_applications($1, $2)", [cls.id, U.a])), /FORBIDDEN/);
  assert.match(await ctx.code(ctx.rpc("select public.school_admin_overview($1)", [schoolPilot])), /FORBIDDEN/);
  assert.ok(await ctx.code(ctx.rpc("insert into public.school_licences (school_id, package) values ($1, 'enterprise')", [school])), "no writes");
  assert.ok(await ctx.code(ctx.rpc("insert into public.school_admins (school_id, user_id) values ($1, $2)", [schoolPilot, U.admin])), "no self-promotion");
  await ctx.rpc("select public.school_detach_class($1, $2)", [school, cls2.id]);
  assert.equal((await ctx.admin("select school_id from public.classes where id=$1", [cls2.id]))[0].school_id, null);
});

test("school admin: totals cannot be differenced against visible classes to single out a suppressed student", async () => {
  // Own school so the shared fixtures stay untouched. Class V: 3 sharing students (visible); class W: 1 sharing student (suppressed).
  const R = { t: id(31), adm: id(32), s1: id(41), s2: id(42), s3: id(43), s4: id(44), s5: id(45), s6: id(46) };
  const rows = Object.entries(R).map(([k, v]) => `('${v}','rev-${k}@x.ch','${JSON.stringify({ full_name: `REV-${k}`, role: k === "t" ? "teacher" : "student" })}')`);
  await ctx.admin(`insert into auth.users values ${rows.join(",")}`);
  await ctx.admin("update public.user_roles set under_16 = false where role = 'student'");
  const [{ platform_create_school: s }] = await ctx.admin("select public.platform_create_school('Sek Review', 'ZH', 'CH')");
  await ctx.admin("select public.platform_assign_licence($1, 'starter')", [s]);
  await ctx.admin("select public.platform_add_school_admin($1, 'rev-adm@x.ch', true)", [s]);
  await ctx.as(R.t);
  const [v] = await ctx.rpc("select * from public.class_create('Rev V', '2026/27')");
  const [w] = await ctx.rpc("select * from public.class_create('Rev W', '2026/27')");
  await ctx.as(R.adm);
  await ctx.rpc("select * from public.school_attach_class($1, $2)", [s, v.join_code]);
  await ctx.rpc("select * from public.school_attach_class($1, $2)", [s, w.join_code]);
  for (const st of [R.s1, R.s2, R.s3]) { await ctx.as(st); await ctx.rpc("select * from public.class_join($1)", [v.join_code]); }
  await ctx.as(R.s4);
  await ctx.rpc("select * from public.class_join($1)", [w.join_code]);
  for (const [st, n] of [[R.s1, 1], [R.s2, 1], [R.s3, 1], [R.s4, 4]]) {
    for (let i = 0; i < n; i++) await app(st, `rev-${st.slice(-2)}-${i}`, i === 0 && st === R.s4 ? "offer" : "applied", { applied: day(-2) });
  }
  await ctx.as(R.adm);
  const ov = (await ctx.rpc("select public.school_admin_overview($1) as o", [s]))[0].o;
  const byName = Object.fromEntries(ov.classes.map((c) => [c.name, c]));
  assert.equal(byName["Rev V"].suppressed, false);
  assert.equal(byName["Rev W"].suppressed, true);
  // Without complementary suppression: totals.applications (7) - V.applications (3) = 4 = exactly student s4's applications.
  for (const k of ["applications", "students_with_application", "students_placed", "students_active_14d"]) {
    assert.equal(ov.totals[k], null, `totals.${k} would reveal the single student of the suppressed class`);
  }
  assert.equal(ov.totals.suppressed, true);
  // Once W has 3 sharing students, every number is visible again.
  for (const st of [R.s5, R.s6]) { await ctx.as(st); await ctx.rpc("select * from public.class_join($1)", [w.join_code]); }
  await ctx.as(R.adm);
  const ov2 = (await ctx.rpc("select public.school_admin_overview($1) as o", [s]))[0].o;
  assert.equal(ov2.totals.suppressed, false);
  assert.equal(ov2.totals.applications, 7);
  assert.equal(ov2.classes.find((c) => c.name === "Rev W").applications, 4);
});

test("teacher: nothing derived from the application status without 'Status zeigen' (support reason, goal metric)", async () => {
  const R = { t: id(51), s: id(52) };
  await ctx.admin(`insert into auth.users values ('${R.t}','rev2-t@x.ch','{"full_name":"REV2-T","role":"teacher"}'),('${R.s}','rev2-s@x.ch','{"full_name":"REV2-S","role":"student"}')`);
  await ctx.admin("update public.user_roles set under_16 = false where user_id = $1", [R.s]);
  await ctx.as(R.t);
  const [k] = await ctx.rpc("select * from public.class_create('Rev Status', '2026/27')");
  await ctx.as(R.s);
  await ctx.rpc("select * from public.class_join($1)", [k.join_code]);
  await ctx.rpc("select public.class_set_sharing_v2($1, true, false, false)", [k.id]); // progress yes, status no, companies no
  // 'saved' with a deadline in 3 days; 'interview' without applied_at (status alone says "sent").
  await app(R.s, "rev2-saved", "saved", { deadline: day(3) });
  await app(R.s, "rev2-int", "interview");
  await ctx.as(R.t);
  await ctx.rpc("insert into public.class_goals (class_id, title, metric, target) values ($1, 'Senden', 'applications_sent', 1)", [k.id]);
  const st = (await ctx.rpc("select public.class_overview_stats($1) as s", [k.id]))[0].s;
  const me = st.students.find((x) => x.student_id === R.s);
  assert.equal(me.applications, 2, "counts are shared");
  assert.ok(!me.reasons.includes("upcoming_deadline"), "'saved'/'preparing' is a status: needs share_status");
  const [g] = await ctx.rpc("select * from public.class_goal_progress($1)", [k.id]);
  assert.equal(g.total_value, 0, "'sent' may only come from applied_at without share_status");
  // with "Status zeigen" both appear
  await ctx.as(R.s);
  await ctx.rpc("select public.class_set_sharing_v2($1, true, false, true)", [k.id]);
  await ctx.as(R.t);
  const st2 = (await ctx.rpc("select public.class_overview_stats($1) as s", [k.id]))[0].s;
  assert.ok(st2.students.find((x) => x.student_id === R.s).reasons.includes("upcoming_deadline"));
  assert.equal((await ctx.rpc("select * from public.class_goal_progress($1)", [k.id]))[0].total_value, 1);
  await ctx.rpc("delete from public.class_goals where class_id=$1", [k.id]); // later tests count all goals
});

test("class goals: teachers CRUD via table, members read, others nothing; progress is aggregate-only", async () => {
  await ctx.as(U.teacher);
  const [g1] = await ctx.rpc("insert into public.class_goals (class_id, title, metric, target, due_date) values ($1, ' 3 Bewerbungen ', 'applications_sent', 3, $2) returning *", [cls.id, day(30)]);
  assert.equal(g1.title, "3 Bewerbungen");
  assert.equal(g1.created_by, U.teacher);
  await ctx.rpc("insert into public.class_goals (class_id, title, metric, target) values ($1, 'Schnuppern', 'trial_days', 1)", [cls.id]);
  await ctx.rpc("insert into public.class_goals (class_id, title, metric) values ($1, 'Lebenslauf fertig', 'custom')", [cls.id]);
  assert.ok(await ctx.code(ctx.rpc("insert into public.class_goals (class_id, title, metric) values ($1, 'x', 'interviews')", [cls.id])), "target required");
  assert.equal((await ctx.rpc("update public.class_goals set target = 4, created_by = $2 where id = $1 returning created_by", [g1.id, U.a]))[0].created_by, U.teacher);

  await ctx.as(U.teacher2);
  assert.ok(await ctx.code(ctx.rpc("insert into public.class_goals (class_id, title) values ($1, 'fremd')", [cls.id])));
  assert.equal((await ctx.rpc("select * from public.class_goals")).length, 0);
  assert.match(await ctx.code(ctx.rpc("select * from public.class_goal_progress($1)", [cls.id])), /FORBIDDEN/);

  await ctx.as(U.a);
  assert.equal((await ctx.rpc("select * from public.class_goals where class_id=$1", [cls.id])).length, 3);
  assert.ok(await ctx.code(ctx.rpc("insert into public.class_goals (class_id, title, created_by) values ($1, 'hack', $2)", [cls.id, U.a])));
  assert.equal((await ctx.rpc("delete from public.class_goals where id=$1", [g1.id])).length, 0);
  assert.equal((await ctx.admin("select count(*)::int as n from public.class_goals where id=$1", [g1.id]))[0].n, 1, "student cannot delete");
  const studentView = await ctx.rpc("select * from public.class_goal_progress($1)", [cls.id]);
  const sent = studentView.find((g) => g.metric === "applications_sent");
  assert.equal(sent.students_counted, 2, "A and C share; B does not");
  assert.equal(sent.suppressed, true, "fewer than 3 contributors -> suppressed for students");
  assert.equal(sent.total_value, null);
  assert.ok(!JSON.stringify(studentView).includes(U.c), "no per-student rows");

  await ctx.as(U.teacher);
  const view = Object.fromEntries((await ctx.rpc("select * from public.class_goal_progress($1)", [cls.id])).map((g) => [g.metric, g]));
  assert.equal(view.applications_sent.students_total, 3);
  assert.equal(view.applications_sent.total_value, 5, "A: 4 sent, C: 1 sent");
  assert.equal(view.applications_sent.students_reached, 1, "A reached target 4");
  assert.equal(view.trial_days.total_value, 1);
  assert.equal(view.trial_days.students_reached, 1);
  assert.equal(view.custom.total_value, null);
  assert.equal(view.custom.suppressed, false);
  await ctx.rpc("delete from public.class_goals where metric='custom' and class_id=$1", [cls.id]);
  assert.equal((await ctx.admin("select count(*)::int as n from public.class_goals"))[0].n, 2);
});

test("export_my_data: all own rows, nobody else's, credentials redacted", async () => {
  await ctx.as(U.a);
  const ex = (await ctx.rpc("select public.export_my_data() as e"))[0].e;
  assert.equal(ex.format, "wendapply-export-v1");
  assert.equal(ex.account.email, "a@x.ch");
  assert.deepEqual(ex.tables.applications.map((r) => r.id).sort(), ["a1", "a2", "a3", "a4", "a5"]);
  assert.ok(ex.tables.user_roles[0].invite_code);
  assert.ok(ex.tables.class_members.length >= 2);
  assert.ok(ex.tables.map_wallets, "map rewards are included");
  assert.equal(ex.tables.calendar_feeds.length, 1);
  assert.equal(ex.tables.calendar_feeds[0].token, undefined, "token redacted");
  assert.ok(ex.classes.some((c) => c.class === "3a" && c.school === "Sek Uster"));
  const text = JSON.stringify(ex);
  assert.ok(!text.includes("b-hidden") && !text.includes("cv-b"), "no other user's rows");
  await ctx.as(U.teacher);
  const t = (await ctx.rpc("select public.export_my_data() as e"))[0].e;
  assert.ok(t.tables.classes.length >= 2 && t.tables.class_goals.length === 2);
  assert.ok(!JSON.stringify(t).includes('"token":'), "invitation tokens redacted");
  await ctx.asAnon();
  assert.ok(await ctx.code(ctx.rpc("select public.export_my_data()")));
});

test("account deletion still leaves nothing behind (new tables cascade)", async () => {
  await ctx.admin("select public.account_delete_prepare($1)", [U.teacher]);
  await ctx.admin("delete from auth.users where id=$1", [U.teacher]);
  assert.deepEqual((await ctx.admin("select public.account_data_report($1) as r", [U.teacher]))[0].r, {});
  assert.equal((await ctx.admin("select count(*)::int as n from public.class_goals"))[0].n, 0, "goals went with the class");
  await ctx.admin("delete from auth.users where id=$1", [U.admin]);
  assert.equal((await ctx.admin("select count(*)::int as n from public.school_admins where user_id=$1", [U.admin]))[0].n, 0);
  assert.equal((await ctx.admin("select count(*)::int as n from public.schools where id=$1", [school]))[0].n, 1, "the school itself stays");
});

// ---------- privilege audit with Supabase-like default privileges ----------
test("audit: with Supabase default grants, anon can execute no SECURITY DEFINER RPC except invite_context; all tables have RLS", async () => {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $s$ select string_to_array($1, '/') $s$;
    grant usage on schema auth to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const fns = (await db.query(`select p.proname, p.proconfig, p.prorettype = 'trigger'::regtype as trg,
      has_function_privilege('anon', p.oid, 'execute') as anon_exec, has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef`)).rows;
  const noPath = fns.filter((r) => !(r.proconfig ?? []).some((c) => c.startsWith("search_path="))).map((r) => r.proname);
  assert.deepEqual(noPath, [], `SECURITY DEFINER without search_path: ${noPath}`);
  const anon = [...new Set(fns.filter((r) => r.anon_exec && !r.trg && r.proname !== "invite_context").map((r) => r.proname))].sort();
  assert.deepEqual(anon, [], `anon may execute: ${anon.join(", ")}`);
  const internal = fns.filter((r) => r.auth_exec && (r.proname.startsWith("_") || r.proname.startsWith("platform_") || r.trg)).map((r) => r.proname);
  assert.deepEqual([...new Set(internal)].sort(), [], "internal / trigger / platform functions must not be callable by users");
  const noRls = (await db.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows;
  assert.deepEqual(noRls, []);
  const anonTables = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and has_table_privilege('anon', c.oid, 'select')`)).rows.map((r) => r.relname);
  assert.deepEqual(anonTables, [], `anon has table privileges on: ${anonTables}`);
});

test("the b2b migrations are idempotent (second run succeeds and keeps data)", async () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const mine = (await readdir(dir)).filter((x) => /^20261116\d+_b2b_.*\.sql$/.test(x)).sort();
  assert.equal(mine.length, 4);
  const before = (await ctx.admin("select count(*)::int as n from public.school_licences"))[0].n;
  for (const f of mine) await ctx.apply(f);
  assert.equal((await ctx.admin("select count(*)::int as n from public.school_licences"))[0].n, before);
  assert.ok(await ctx.code(ctx.admin(`update public.user_roles set role='hacker' where user_id=$1`, [U.a])), "role check still in place");
});
