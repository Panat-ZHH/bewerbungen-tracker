import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  STATUS_ORDER, statusLabels, statusHints, showsDeadline, isClosedStatus, isDecidedStatus, isSentStatus, isRepliedStatus, isConversationStatus,
  isSchnupperStatus, isPlacedStatus, isKnownStatus, schnupperCounts, isPlacedFromCounts, parseSchnupperResult, parseTestResult,
} from "../lib/status.ts";
import { buildingStages } from "../lib/application-map.ts";
import { parseFriendIsland } from "../lib/friend-island.ts";
import { detectJobTypes, classifyJob } from "../lib/job-filters/taxonomy.ts";

const NEW = ["schnupper_planned", "schnupper_done", "aptitude_test", "contract_signed"];

test("every status has label, hint, building stage and a place in the pipeline order", () => {
  assert.equal(new Set(STATUS_ORDER).size, STATUS_ORDER.length);
  assert.deepEqual(Object.keys(statusLabels), STATUS_ORDER);
  for (const s of STATUS_ORDER) { assert.ok(statusLabels[s], s); assert.ok(statusHints[s], s); assert.ok(buildingStages[s], s); assert.ok(isKnownStatus(s)); }
  assert.deepEqual(Object.keys(buildingStages), STATUS_ORDER);
  assert.equal(isKnownStatus("bogus"), false);
});

test("labels: existing stored values keep working, new steps are named in Lehrstellen wording", () => {
  assert.equal(statusLabels.offer, "Zusage");
  assert.equal(statusLabels.rejected, "Absage erhalten");
  assert.equal(statusLabels.contract_signed, "Vertrag unterschrieben");
  assert.equal(statusLabels.aptitude_test, "Eignungstest / Multicheck");
  assert.match(statusLabels.schnupper_planned, /Schnupperlehre/);
  assert.match(statusLabels.schnupper_done, /Schnupperlehre/);
  for (const label of Object.values(statusLabels)) assert.doesNotMatch(label, /ß/);
});

test("status groups", () => {
  assert.deepEqual(STATUS_ORDER.filter(isClosedStatus), ["contract_signed", "rejected", "withdrawn"]);
  assert.deepEqual(STATUS_ORDER.filter(isDecidedStatus), ["offer", "contract_signed", "rejected", "withdrawn"]);
  assert.deepEqual(STATUS_ORDER.filter(isConversationStatus), ["interview", "final_interview"]);
  assert.deepEqual(STATUS_ORDER.filter(isSchnupperStatus), ["schnupper_planned", "schnupper_done"]);
  assert.deepEqual(STATUS_ORDER.filter(isPlacedStatus), ["offer", "contract_signed"]);
  // old rule kept: applied/interview/final_interview/offer/rejected are sent
  for (const s of ["applied", "interview", "final_interview", "offer", "rejected"]) assert.ok(isSentStatus(s), s);
  assert.ok(isSentStatus("aptitude_test") && isSentStatus("contract_signed"));
  assert.ok(!isSentStatus("schnupper_planned") && !isSentStatus("saved") && !isSentStatus("withdrawn"));
  for (const s of ["interview", "offer", "rejected", ...NEW]) assert.ok(isRepliedStatus(s), s);
  assert.ok(!isRepliedStatus("applied") && !isRepliedStatus("saved"));
});

test("'Bewerben bis' is hidden once Zusage / Absage / Vertrag (or withdrawn)", () => {
  for (const s of ["offer", "rejected", "contract_signed", "withdrawn"]) assert.equal(showsDeadline(s), false, s);
  for (const s of ["saved", "preparing", "applied", "schnupper_planned", "schnupper_done", "aptitude_test", "interview", "final_interview"]) assert.equal(showsDeadline(s), true, s);
});

test("class-view counts per new status come additively from the shared status counts", () => {
  assert.deepEqual(schnupperCounts({ schnupper_planned: 2, schnupper_done: 1, aptitude_test: 3, contract_signed: 1, rejected: 4, applied: 9 }), { schnupperPlanned: 2, schnupperDone: 1, schnupper: 3, tests: 3, contracts: 1, rejections: 4 });
  assert.equal(schnupperCounts(undefined).schnupper, 0);
  assert.equal(isPlacedFromCounts({ offer: 1 }), true);
  assert.equal(isPlacedFromCounts({ contract_signed: 1 }), true);
  assert.equal(isPlacedFromCounts({ applied: 3, rejected: 1 }), false);
  assert.equal(isPlacedFromCounts({}, true), true);
});

test("result parsers accept only known values", () => {
  assert.equal(parseSchnupperResult("positive"), "positive");
  assert.equal(parseSchnupperResult("nope"), undefined);
  assert.equal(parseTestResult("passed"), "passed");
  assert.equal(parseTestResult(null), undefined);
});

test("friend island keeps houses with the new statuses", () => {
  const island = parseFriendIsland({ applications: STATUS_ORDER.map((status, i) => ({ id: `h${i}`, status, createdAt: "2026-10-01" })).concat([{ id: "x", status: "bogus" }]) });
  assert.deepEqual(island.applications.map((a) => a.status), STATUS_ORDER);
});

test("search: Schnupperlehre is its own listing type", () => {
  assert.ok(detectJobTypes({ title: "Schnupperlehre Informatiker/in EFZ", company: "Acme", url: "https://x.ch" }).includes("schnupperlehre"));
  assert.equal(classifyJob({ title: "Schnupperlehre Informatiker/in EFZ", company: "Acme", url: "https://x.ch" }).jobType, "schnupperlehre");
  assert.equal(classifyJob({ title: "Lehrstelle Informatiker/in EFZ", company: "Acme", url: "https://x.ch" }).jobType, "lehrstelle");
});

test("migration adds the schnupper/test columns, keeps old rows valid and rewards the new sent steps", async () => {
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
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const index = files.indexOf("20261109020000_lehrstellen_status.sql");
  assert.ok(index > 0);
  for (const f of files.slice(0, index)) await db.exec(await readFile(new URL(f, dir), "utf8"));
  const U = "00000000-0000-4000-8000-0000000000a1";
  await db.query("insert into auth.users (id) values ($1)", [U]);
  const add = (id, status, extra = "") => db.query(`insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at${extra ? ",schnupper_date,schnupper_result,test_result" : ""}) values ($1,$2,'F','S','other',$3,current_date,current_date${extra ? ",current_date,'positive','passed'" : ""})`, [id, U, status]);
  await add("old-offer", "offer"); // pre-migration row
  for (const f of files.slice(index)) { await db.exec(await readFile(new URL(f, dir), "utf8")); await db.exec(await readFile(new URL(f, dir), "utf8")); } // idempotent
  assert.equal((await db.query("select status, schnupper_date, test_result from public.applications where id='old-offer'")).rows[0].schnupper_date, null);
  await add("s1", "schnupper_planned", "x");
  await add("s2", "aptitude_test");
  await add("s3", "contract_signed");
  await add("s4", "schnupper_done");
  const rewarded = (await db.query("select application_id from public.map_application_rewards where user_id=$1 order by 1", [U])).rows.map((r) => r.application_id);
  assert.deepEqual(rewarded, ["old-offer", "s2", "s3"], "Schnupperlehre alone earns nothing, test and contract do");
  await assert.rejects(db.query("insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at,schnupper_result) values ('bad',$1,'F','S','other','saved',current_date,current_date,'wow')", [U]));
  await assert.rejects(db.query("insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at,test_result) values ('bad2',$1,'F','S','other','saved',current_date,current_date,'maybe')", [U]));
});
