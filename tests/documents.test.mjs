import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { DOSSIER_KINDS, MAX_DOCUMENT_BYTES, dossierChecklist, safeFileName, validateDocumentFile } from "../lib/documents-core.ts";
import { CATEGORY_OPTIONS, categoryLabel, normalizeCategory } from "../lib/categories.ts";
import { applicationTimeline } from "../lib/application-timeline.ts";
import { FIELDS } from "../lib/job-filters/taxonomy.ts";

test("document validation: pdf/jpg/png up to 5 MB, photo must be an image", () => {
  assert.equal(validateDocumentFile({ name: "cv.pdf", size: 1000, type: "application/pdf" }, "lebenslauf"), null);
  assert.equal(validateDocumentFile({ name: "a.JPG", size: 1000, type: "" }, "foto"), null);
  assert.match(validateDocumentFile({ name: "cv.docx", size: 1000, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, "lebenslauf"), /nicht unterstützt/);
  assert.match(validateDocumentFile({ name: "big.pdf", size: MAX_DOCUMENT_BYTES + 1, type: "application/pdf" }, "zeugnisse"), /5 MB/);
  assert.match(validateDocumentFile({ name: "foto.pdf", size: 10, type: "application/pdf" }, "foto"), /JPG/);
  assert.match(validateDocumentFile({ name: "empty.pdf", size: 0, type: "application/pdf" }, "sonstiges"), /leer/);
});

test("safeFileName strips folders and odd characters", () => {
  assert.equal(safeFileName("../Zeugnis Müller (1).pdf"), "Zeugnis_Muller__1_.pdf");
  assert.equal(safeFileName("..."), "dokument");
});

test("dossier checklist counts attached kinds", () => {
  const none = dossierChecklist([]);
  assert.equal(none.total, DOSSIER_KINDS.length);
  assert.equal(none.done, 0);
  const some = dossierChecklist(["lebenslauf", "foto", "sonstiges", "foto"]);
  assert.equal(some.done, 2);
  assert.deepEqual(some.items.filter((i) => i.done).map((i) => i.kind), ["lebenslauf", "foto"]);
});

test("Berufsfelder equal the 13 search categories plus Anderes; legacy values are mapped", () => {
  assert.equal(CATEGORY_OPTIONS.length, 14);
  assert.deepEqual(CATEGORY_OPTIONS.slice(0, 13).map((o) => o.value), FIELDS.map((f) => f.id));
  assert.equal(normalizeCategory("software"), "informatik");
  assert.equal(normalizeCategory("banking"), "finanz-recht");
  assert.equal(normalizeCategory("quatsch"), "other");
  assert.equal(normalizeCategory(undefined), "other");
  assert.equal(categoryLabel("gesundheit"), "Gesundheit & Pflege");
});

test("timeline is derived from dates and sorted", () => {
  const entries = applicationTimeline({ createdAt: "2026-10-01", appliedAt: "2026-10-05", deadline: "2026-10-03", updatedAt: "2026-10-09", status: "applied" }, new Date("2026-10-10"));
  assert.deepEqual(entries.map((e) => e.key), ["created", "applied", "updated"]);
  const future = applicationTimeline({ createdAt: "2026-10-01", deadline: "2026-12-01", updatedAt: "2026-10-01", status: "saved" }, new Date("2026-10-10"));
  assert.deepEqual(future.map((e) => [e.key, e.future]), [["created", false], ["deadline", true]]);
});

// --- migration against PGlite -------------------------------------------------------------------------------------
const dir = new URL("../supabase/migrations/", import.meta.url);
const U1 = "00000000-0000-4000-8000-0000000000a1", U2 = "00000000-0000-4000-8000-0000000000b2";
async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  const { readdir } = await import("node:fs/promises");
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  return db;
}
const as = async (db, user) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await db.exec("set role authenticated"); };

test("documents migration: bucket limits, kinds, owner-only attachments, legacy category mapping", async () => {
  const db = await fresh();
  const bucket = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id='cvs'")).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 5 * 1024 * 1024);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ["application/pdf", "image/jpeg", "image/png"]);

  await db.exec("reset role");
  await db.query("insert into auth.users(id,email) values ($1,'a@x.ch'),($2,'b@x.ch')", [U1, U2]);
  const rows = (await db.query("select count(*)::int as n from public.cvs where user_id=$1", [U1])).rows[0].n;
  assert.equal(rows, 0, "no adult CV placeholders for new users");

  await db.query("insert into public.applications(id,user_id,company,position,category,status,created_at,updated_at) values ('a1',$1,'Alpha','Dev','software','saved',current_date,current_date),('b1',$2,'Beta','Dev','banking','saved',current_date,current_date)", [U1, U2]);
  await db.query("insert into public.cvs(id,user_id,name,type,kind,description,updated_at,status,storage_path) values ('d1',$1,'Mein CV','other','lebenslauf','',current_date,'Ready',$3),('d2',$2,'Fremd','other','zeugnisse','',current_date,'Ready',$4)", [U1, U2, `${U1}/d1/cv.pdf`, `${U2}/d2/z.pdf`]);
  await assert.rejects(db.query("insert into public.cvs(id,user_id,name,type,kind,description,updated_at,status) values ('bad',$1,'x','other','lohn','',current_date,'Ready')", [U1]), /cvs_kind_check|violates check/);

  await as(db, U1);
  await db.query("insert into public.application_documents(application_id,document_id,user_id) values ('a1','d1',$1)", [U1]);
  await assert.rejects(db.query("insert into public.application_documents(application_id,document_id,user_id) values ('a1','d2',$1)", [U1]), /row-level security/, "cannot attach someone else's document");
  await assert.rejects(db.query("insert into public.application_documents(application_id,document_id,user_id) values ('b1','d1',$1)", [U1]), /row-level security/, "cannot attach to someone else's application");
  assert.equal((await db.query("select count(*)::int as n from public.application_documents")).rows[0].n, 1);

  await as(db, U2);
  assert.equal((await db.query("select count(*)::int as n from public.application_documents")).rows[0].n, 0, "other user sees nothing");

  await db.exec("reset role");
  await db.query("delete from public.cvs where id='d1'");
  assert.equal((await db.query("select count(*)::int as n from public.application_documents")).rows[0].n, 0, "attachment removed with the document");
});

test("documents migration: idempotent and maps legacy categories", async () => {
  const db = await fresh();
  await db.exec(await readFile(new URL("20261109070000_documents_student_fields.sql", dir), "utf8"));
  await db.query("insert into auth.users(id,email) values ($1,'a@x.ch')", [U1]);
  await db.query("insert into public.applications(id,user_id,company,position,category,status,created_at,updated_at) values ('x1',$1,'A','P','software','saved',current_date,current_date),('x2',$1,'A','P','consulting','saved',current_date,current_date),('x3',$1,'A','P','other','saved',current_date,current_date)", [U1]);
  await db.exec(await readFile(new URL("20261109070000_documents_student_fields.sql", dir), "utf8"));
  const cats = (await db.query("select id, category from public.applications order by id")).rows.map((r) => r.category);
  assert.deepEqual(cats, ["informatik", "kaufmaennisch", "other"]);
});
