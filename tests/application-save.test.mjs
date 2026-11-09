// Saving intermediate states of an application: row mapping (cleared fields must be sent as null), local drafts,
// and the database accepting partial rows and every status through its whole life.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fromRow, toRow } from "../lib/application-rows.ts";
import { DRAFT_MAX_AGE_MS, draftKey, isDirty, parseDraft, serializeDraft } from "../lib/application-draft.ts";
import { STATUS_ORDER } from "../lib/status.ts";

const full = {
  id: "u-app-1", company: "Firma", position: "Stelle", location: "Zürich", jobUrl: "https://x.ch/a", source: "jobs.ch", category: "other", status: "applied",
  createdAt: "2026-11-01", updatedAt: "2026-11-02", jobDescription: "Text", notes: "Notiz", contactName: "Frau Meier", contactInfo: "m@x.ch", deadline: "2026-12-01",
  schnupperDate: "2026-12-02", schnupperResult: "positive", schnupperNotes: "nett", testDate: "2026-12-03", testResult: "passed",
};

test("toRow sends cleared optional fields as null (undefined would be dropped by supabase-js and the old value would survive)", () => {
  const cleared = { ...full, location: "", jobUrl: "", source: "", jobDescription: "", notes: "", contactName: "", contactInfo: "", deadline: "", schnupperDate: undefined, schnupperResult: undefined, schnupperNotes: undefined, testDate: undefined, testResult: undefined };
  const row = toRow(cleared, "u");
  for (const key of ["location", "job_url", "source", "job_description", "notes", "contact_name", "contact_info", "deadline", "schnupper_date", "schnupper_result", "schnupper_notes", "test_date", "test_result", "applied_at", "salary_min", "cv_type"]) {
    assert.ok(key in row && row[key] === null, `${key} must be an explicit null`);
  }
  // what actually goes over the wire: JSON.stringify keeps null but drops undefined
  const wire = JSON.parse(JSON.stringify(row));
  assert.ok("notes" in wire && wire.notes === null);
  assert.equal(row.company, "Firma");
  assert.equal(row.user_id, "u");
});

test("toRow keeps filled values, fromRow reads them back (round trip) and maps null to undefined", () => {
  const back = fromRow({ ...toRow(full, "u"), category: "other" });
  assert.deepEqual({ ...back, matchScore: undefined }, { ...full, matchScore: undefined, appliedAt: undefined, salaryMin: undefined, salaryMax: undefined, currency: undefined, cvType: undefined });
  const empty = fromRow(toRow({ id: "x", company: "A", position: "B", category: "other", status: "saved", createdAt: "2026-11-01", updatedAt: "2026-11-01" }, "u"));
  assert.equal(empty.notes, undefined);
  assert.equal(empty.location, undefined);
  assert.equal(empty.schnupperResult, undefined);
});

test("every status survives toRow/fromRow", () => {
  for (const status of STATUS_ORDER) assert.equal(fromRow(toRow({ ...full, status }, "u")).status, status);
});

const BLANK = { company: "", position: "", notes: "", location: "" };

test("drafts: keys are per account and target", () => {
  assert.notEqual(draftKey("a", "new"), draftKey("b", "new"));
  assert.notEqual(draftKey("a", "new"), draftKey("a", "app-1"));
});

test("drafts: round trip, only known string keys are restored", () => {
  const now = 1_700_000_000_000;
  const raw = serializeDraft({ company: "Halbfertig", position: "", notes: "n", location: "", evil: "x" }, now);
  const draft = parseDraft(raw, BLANK, now + 1000);
  assert.deepEqual(draft?.form, { company: "Halbfertig", position: "", notes: "n", location: "" });
  assert.equal(draft?.savedAt, now);
});

test("drafts: missing, broken, foreign, wrong-version and outdated data are ignored", () => {
  const now = 1_700_000_000_000;
  assert.equal(parseDraft(null, BLANK, now), null);
  assert.equal(parseDraft("", BLANK, now), null);
  assert.equal(parseDraft("{not json", BLANK, now), null);
  assert.equal(parseDraft(JSON.stringify({ v: 99, savedAt: now, form: {} }), BLANK, now), null);
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: "x", form: {} }), BLANK, now), null);
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: now, form: null }), BLANK, now), null);
  assert.equal(parseDraft(serializeDraft({ company: "x" }, now), BLANK, now + DRAFT_MAX_AGE_MS + 1), null);
  assert.deepEqual(parseDraft(JSON.stringify({ v: 1, savedAt: now, form: { company: 5, notes: "ok" } }), BLANK, now)?.form, { ...BLANK, notes: "ok" });
});

test("isDirty ignores whitespace-only differences", () => {
  assert.equal(isDirty({ ...BLANK }, { ...BLANK }), false);
  assert.equal(isDirty({ ...BLANK, notes: "  " }, { ...BLANK }), false);
  assert.equal(isDirty({ ...BLANK, notes: "x" }, { ...BLANK }), true);
  assert.equal(isDirty({ ...BLANK, company: "A" }, { ...BLANK, company: "B" }), true);
});

test("database: a partial row, every status, clearing fields and the full pipeline are accepted (as the app sends them)", async () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;`);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const U = "00000000-0000-4000-8000-0000000000b1";
  await db.query("insert into auth.users (id) values ($1)", [U]);
  const columns = Object.keys(toRow(full, U));
  const write = async (application, insert) => {
    const row = toRow(application, U);
    const values = columns.map((c) => row[c]);
    if (insert) await db.query(`insert into public.applications (${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")})`, values);
    else await db.query(`update public.applications set ${columns.map((c, i) => `${c}=$${i + 1}`).join(",")} where id='p1'`, values);
  };
  const minimal = { id: "p1", company: "Nur Firma", position: "Nur Stelle", category: "other", status: "saved", createdAt: "2026-11-01", updatedAt: "2026-11-01" };
  await write(minimal, true); // only the two required fields, everything else empty
  let state = { ...minimal };
  for (const status of STATUS_ORDER) { state = { ...state, status }; await write(state, false); assert.equal((await db.query("select status from public.applications where id='p1'")).rows[0].status, status); }
  state = { ...full, id: "p1" };
  await write(state, false);
  assert.equal((await db.query("select notes, contact_name, schnupper_result, test_result from public.applications where id='p1'")).rows[0].notes, "Notiz");
  state = { ...state, location: "", jobUrl: "", source: "", jobDescription: "", notes: "", contactName: "", contactInfo: "", deadline: "", schnupperDate: undefined, schnupperResult: undefined, schnupperNotes: undefined, testDate: undefined, testResult: undefined };
  await write(state, false);
  const after = (await db.query("select * from public.applications where id='p1'")).rows[0];
  for (const c of ["location", "job_url", "source", "job_description", "notes", "contact_name", "contact_info", "deadline", "schnupper_date", "schnupper_result", "schnupper_notes", "test_date", "test_result"]) assert.equal(after[c], null, `${c} cleared`);
  assert.equal(after.company, "Firma");
});
