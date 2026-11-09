import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { ids, seededClasses, setupTeacherDb } from "./helpers/teacher-db.mjs";
import { loadLib } from "./helpers/load-lib.mjs";

const names = await loadLib("profile-name-utils");
const consent = await loadLib("consent");
const U16 = "00000000-0000-4000-8000-0000000000c1", O16 = "00000000-0000-4000-8000-0000000000c2", UNK = "00000000-0000-4000-8000-0000000000c3";

test("names: placeholders never reach the screen, initials come from real names", () => {
  assert.equal(names.shownName({ displayName: "u0123", email: "u0123@x.ch" }), "Schüler:in");
  assert.equal(names.shownName({ displayName: "max@x.ch" }), "Schüler:in");
  assert.equal(names.shownName({ displayName: "", email: "a@b.c" }), "Schüler:in");
  assert.equal(names.shownName({ displayName: "Nutzer" }), "Schüler:in");
  assert.equal(names.shownName({ displayName: "Mia Muster" }), "Mia Muster");
  assert.equal(names.shownName({ alias: " Mia M. ", displayName: "u0" }), "Mia M.");
  assert.equal(names.shownName({ displayName: "x" }, "Nutzer:in"), "x");
  assert.equal(names.initialsFromName("Mia Muster"), "MM");
  assert.equal(names.initialsFromName("Anna-Lena von Arx"), "AA");
  assert.equal(names.initialsFromName("u0"), "U");
  assert.equal(names.initialsFromName("u0123@mail.ch"), "U");
  assert.equal(names.initialsFromName(""), "?");
  assert.equal(names.cleanNameInput(" Mia ", " Muster "), "Mia Muster");
  assert.equal(names.cleanNameInput("a@b.ch"), null);
  assert.equal(names.cleanNameInput("  "), null);
});

test("consent: sharing is preselected only for confirmed 16+, labels match the SQL consent text", async () => {
  assert.deepEqual(consent.defaultConsent(true), { share: false, status: false, companies: false });
  assert.deepEqual(consent.defaultConsent(null), { share: false, status: false, companies: false });
  assert.deepEqual(consent.defaultConsent(false), { share: true, status: true, companies: true });
  const sql = await readFile(new URL("../supabase/migrations/20261109030000_names_consent_notices.sql", import.meta.url), "utf8");
  for (const label of Object.values(consent.CONSENT_LABELS)) assert.ok(sql.includes(`«${label}»`), `${label} missing in the consent text`);
  const ui = await readFile(new URL("../components/classes/privacy-panel.tsx", import.meta.url), "utf8");
  assert.ok(!/Deine (Freunde|Lehrperson) \{/.test(ui) && !ui.includes('"Deine Lehrperson"') && !ui.includes('"Deine Freunde"'));
});

test("SQL: names, age band, defaults per age, aliases and the consent text", async () => {
  const t = await setupTeacherDb();
  const { "10a": c } = await seededClasses(t);
  await t.admin(`insert into auth.users values ($1,'u0123@x.ch','{}'), ($2,'o16@x.ch','{"full_name":"Olga Gross"}'), ($3,'unk@x.ch','{}')`, [U16, O16, UNK]);

  // name status: e-mail prefix counts as missing, a real name does not
  await t.as(U16);
  let [st] = await t.rpc("select * from public.profile_name_status()");
  assert.deepEqual([st.display_name, st.needs_name, st.under_16], ["u0123", true, null]);
  assert.match(await t.code(t.rpc("select public.profile_set_display_name('a@b.ch')")), /INVALID_NAME/);
  assert.match(await t.code(t.rpc("select public.profile_set_display_name('   ')")), /INVALID_NAME/);
  await t.rpc("select public.profile_set_display_name('Uri Under')");
  await t.rpc("select public.profile_set_under_16(true)");
  [st] = await t.rpc("select * from public.profile_name_status()");
  assert.deepEqual([st.display_name, st.needs_name, st.under_16], ["Uri Under", false, true]);
  await t.as(O16);
  assert.equal((await t.rpc("select * from public.profile_name_status()"))[0].needs_name, false);
  await t.rpc("select public.profile_set_under_16(false)");

  // defaults: under 16 and unknown start with everything off, 16+ keeps the old default
  for (const u of [U16, O16, UNK]) { await t.as(u); await t.rpc("select * from public.class_join($1)", [c.join_code]); }
  const flags = await t.admin("select student_id, share_applications a, share_status s, share_companies c from public.class_members where student_id = any($1)", [[U16, O16, UNK]]);
  const by = Object.fromEntries(flags.map((r) => [r.student_id, [r.a, r.s, r.c]]));
  assert.deepEqual(by[U16], [false, false, false]);
  assert.deepEqual(by[UNK], [false, false, false]);
  assert.deepEqual(by[O16], [true, true, true]);
  // teacher sees an under-16 student only by name
  await t.as(ids.owner);
  const row = (await t.rpc("select * from public.teacher_class_students($1)", [c.id])).find((r) => r.student_id === U16);
  assert.equal(row.hidden, true);
  assert.equal(row.display_name, "Uri Under");
  // and the student can switch it on afterwards
  await t.as(U16); await t.rpc("select public.class_set_sharing_v2($1, true, true, true)", [c.id]);
  assert.equal((await t.admin("select share_applications a from public.class_members where student_id=$1", [U16]))[0].a, true);

  // aliases: only the teacher of the class can set and read them; empty clears
  await t.as(ids.owner);
  await t.rpc("select public.class_set_student_alias($1,$2,'  Uri U.  ')", [c.id, U16]);
  assert.deepEqual(await t.rpc("select * from public.class_student_aliases($1)", [c.id]), [{ student_id: U16, alias: "Uri U." }]);
  assert.match(await t.code(t.rpc("select public.class_set_student_alias($1,$2,'x')", [c.id, ids.stranger])), /NOT_FOUND/);
  assert.match(await t.code(t.rpc("select public.class_set_student_alias($1,$2,$3)", [c.id, U16, "x".repeat(61)])), /INVALID_NAME/);
  await t.as(ids.other);
  assert.match(await t.code(t.rpc("select public.class_set_student_alias($1,$2,'hack')", [c.id, U16])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select * from public.class_student_aliases($1)", [c.id])), /FORBIDDEN/);
  await t.as(U16);
  assert.match(await t.code(t.rpc("select * from public.class_student_aliases($1)", [c.id])), /FORBIDDEN/);
  assert.match(await t.code(t.rpc("select * from public.class_student_aliases limit 1")), /permission denied|does not exist/); // table itself is closed
  await t.as(ids.owner);
  await t.rpc("select public.class_set_student_alias($1,$2,'')", [c.id, U16]);
  assert.deepEqual(await t.rpc("select * from public.class_student_aliases($1)", [c.id]), []);

  // consent text: one sentence per real switch, nothing about data the teacher can't get
  await t.as(U16);
  const info = (await t.rpc("select public.class_visibility_info() v"))[0].v;
  const sees = info.teacher_sees.join("\n");
  for (const label of ["Fortschritt teilen", "Status zeigen", "Firmen zeigen"]) assert.ok(sees.includes(`«${label}»`), label);
  assert.ok(info.teacher_never_sees.some((x) => /Notizen/.test(x)) && info.teacher_never_sees.some((x) => /E-Mail/.test(x)));

  // idempotent
  await t.apply(t.files.find((f) => f.includes("names_consent_notices")));
});
