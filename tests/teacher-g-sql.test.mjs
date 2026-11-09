import assert from "node:assert/strict";
import { test } from "node:test";
import { ids, seededClasses, setupTeacherDb } from "./helpers/teacher-db.mjs";

// Seed (see helpers/teacher-db.mjs): class 10a has s1 (shares all, 4 apps incl. an offer), s2 (does NOT share, has offer),
// s3 (status hidden), s4 (companies hidden, 1 preparing app 60 days old). stranger is in a foreign class.

test("class deadlines: teachers write, members read, strangers and other teachers are locked out", async () => {
  const t = await setupTeacherDb(); const a = (await seededClasses(t))["10a"].id;
  await t.as(ids.owner);
  const id = (await t.rpc("select public.class_deadline_add($1, ' Dossier abgeben ', current_date + 3, 'Bis 12 Uhr') as id", [a]))[0].id;
  assert.match(await t.code(t.rpc("select public.class_deadline_add($1, '   ', current_date, null)", [a])), /INVALID_REQUEST/);
  assert.equal((await t.rpc("select * from public.class_deadline_list($1)", [a]))[0].title, "Dossier abgeben");
  await t.as(ids.co); assert.match(await t.code(t.rpc("select * from public.class_deadline_list($1)", [a])), /FORBIDDEN/);
  await t.as(ids.s1);
  assert.equal((await t.rpc("select * from public.class_deadline_list($1)", [a])).length, 1);
  assert.equal((await t.rpc("select * from public.my_class_deadlines()")).length, 1);
  assert.match(await t.code(t.rpc("select public.class_deadline_add($1, 'x', current_date, null)", [a])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select public.class_deadline_delete($1)", [id])), /FORBIDDEN/);
  assert.match(await t.code(t.database.query("select * from public.class_deadlines")), /permission denied/);
  await t.as(ids.stranger);
  assert.match(await t.code(t.rpc("select * from public.class_deadline_list($1)", [a])), /FORBIDDEN/);
  assert.equal((await t.rpc("select * from public.my_class_deadlines()")).length, 0);
  await t.as(ids.owner); await t.rpc("select public.class_deadline_delete($1)", [id]);
  assert.equal((await t.rpc("select * from public.class_deadline_list($1)", [a])).length, 0);
});

test("attention list respects consent: non-sharing students only via voluntary self-report", async () => {
  const t = await setupTeacherDb(); const a = (await seededClasses(t))["10a"].id;
  await t.as(ids.owner);
  let rows = await t.rpc("select * from public.teacher_attention($1, 14)", [a]);
  const byId = Object.fromEntries(rows.map((r) => [r.student_id, r]));
  assert.equal(byId[ids.s2], undefined, "non-sharing student must not be flagged without self-report");
  assert.equal(byId[ids.s1], undefined, "s1 has an offer");
  assert.equal(byId[ids.s3], undefined, "s3 has a fresh application");
  // s2 reports voluntarily
  await t.as(ids.s2); await t.rpc("select public.class_set_self_report($1, true)", [a]);
  assert.equal((await t.rpc("select * from public.my_self_reports()")).find((r) => r.class_id === a).self_report, true);
  await t.as(ids.owner);
  rows = await t.rpc("select * from public.teacher_attention(null, 14)");
  const s2 = rows.find((r) => r.student_id === ids.s2);
  assert.equal(s2.reason, "self_report");
  assert.equal(rows.some((r) => r.student_id === ids.stranger), false, "foreign class students never appear");
  await t.as(ids.other);
  assert.deepEqual((await t.rpc("select * from public.teacher_attention(null, 14)")).map((r) => r.class_name), ["Fremdklasse"], "only own classes");
  assert.match(await t.code(t.rpc("select * from public.teacher_attention($1)", [a])), /FORBIDDEN/);
  await t.as(ids.s1); assert.match(await t.code(t.rpc("select * from public.teacher_attention(null)")), /FORBIDDEN|role/i);
});

test("attention list: no application and no reply (status must be shared)", async () => {
  const t = await setupTeacherDb(); const a = (await seededClasses(t))["10a"].id;
  const old = "insert into public.applications (id,user_id,company,position,location,category,status,applied_at,created_at,updated_at) values ($2,$1,'Alt AG','P','Z','software','applied', current_date - 30, current_date - 31, current_date - 30)";
  await t.admin("delete from public.applications where user_id = $1", [ids.s4]); // s4 shares applications but hides status
  await t.admin(old, [ids.s3, "old3"]); // s3 shares status
  await t.as(ids.owner);
  let rows = await t.rpc("select * from public.teacher_attention($1, 14)", [a]);
  assert.equal(rows.find((r) => r.student_id === ids.s4).reason, "no_application");
  const s3 = rows.find((r) => r.student_id === ids.s3);
  assert.equal(s3.reason, "no_reply"); assert.equal(s3.days, 30); assert.equal(s3.open_count, 1);
  // s4 now has a stale application, but hides the status -> staleness must not be derivable
  await t.admin(old, [ids.s4, "old4"]);
  rows = await t.rpc("select * from public.teacher_attention($1, 14)", [a]);
  assert.equal(rows.find((r) => r.student_id === ids.s4), undefined);
  // threshold respected
  assert.equal((await t.rpc("select * from public.teacher_attention($1, 60)", [a])).find((r) => r.student_id === ids.s3), undefined);
});

test("bulk invite v2 reports every address and never leaks across roles", async () => {
  const t = await setupTeacherDb(); const a = (await seededClasses(t))["10a"].id;
  await t.as(ids.owner);
  const out = await t.rpc("select * from public.class_invite_create_many_v2($1, array['new@x.de','NEW@x.de','bad@','s1@x.de',' ','neu2@x.de'])", [a]);
  assert.deepEqual(out.map((r) => [r.email, r.outcome]), [["new@x.de", "created"], ["new@x.de", "duplicate"], ["bad@", "invalid"], ["s1@x.de", "already_member"], ["neu2@x.de", "created"]]);
  assert.ok(out[0].token.length >= 22); assert.equal(out[2].token, null);
  const again = await t.rpc("select * from public.class_invite_create_many_v2($1, array['new@x.de'])", [a]);
  assert.equal(again[0].outcome, "already_invited"); assert.equal(again[0].token, out[0].token);
  await t.as(ids.other); assert.match(await t.code(t.rpc("select * from public.class_invite_create_many_v2($1, array['a@b.de'])", [a])), /FORBIDDEN/);
  await t.as(ids.s1); assert.match(await t.code(t.rpc("select * from public.class_invite_create_many_v2($1, array['a@b.de'])", [a])), /FORBIDDEN|role/i);
});

test("audit log and consent-aware export", async () => {
  const t = await setupTeacherDb(); const a = (await seededClasses(t))["10a"].id;
  await t.as(ids.owner);
  await t.rpc("select public.class_log_view($1, $2)", [a, ids.s1]); await t.rpc("select public.class_log_view($1, $2)", [a, ids.s1]);
  assert.match(await t.code(t.rpc("select public.class_log_view($1, $2)", [a, ids.stranger])), /NOT_FOUND/);
  await t.as(ids.s1);
  const log = await t.rpc("select * from public.my_view_log()");
  assert.equal(log.length, 1); assert.equal(log[0].kind, "view"); assert.equal(log[0].teacher_name, "Frau Owner");
  await t.as(ids.s2); assert.equal((await t.rpc("select * from public.my_view_log()")).length, 0);
  await t.as(ids.other); assert.match(await t.code(t.rpc("select public.class_log_view($1, $2)", [a, ids.s1])), /FORBIDDEN/);
  await t.as(ids.owner);
  const rows = await t.rpc("select * from public.teacher_class_applications_export($1)", [a]);
  const of = (id) => rows.filter((r) => r.student_id === id);
  assert.equal(of(ids.s2).length, 0, "non-sharing student is not exported");
  assert.equal(of(ids.s1).length, 4);
  assert.ok(of(ids.s3).length > 0 && of(ids.s3).every((r) => r.company === null && r.status), "companies hidden by s3");
  assert.ok(of(ids.s4).length > 0 && of(ids.s4).every((r) => r.company && r.status === null), "status hidden by s4");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["applied_at", "company", "created_at", "deadline", "display_name", "position", "status", "student_id"]);
  await t.as(ids.s1);
  const kinds = (await t.rpc("select kind from public.my_view_log()")).map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["export", "view"]);
  await t.as(ids.s2); assert.equal((await t.rpc("select * from public.my_view_log()")).length, 0);
});
