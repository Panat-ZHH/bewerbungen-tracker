import assert from "node:assert/strict";
import { test } from "node:test";
import { createECDH, createDecipheriv, createHmac, createPublicKey, verify, randomBytes } from "node:crypto";
import { computeReminders, buildIcs, DEFAULT_SETTINGS, normalizeSettings, isFeedToken, newFeedToken, digestText } from "../lib/reminders.ts";
import { encryptPayload, generateVapidKeys, vapidJwt } from "../lib/reminders-push.ts";
import { buildMime, smtpConfigFromEnv, noopMailer } from "../lib/reminders-mail.ts";

const app = (o) => ({ id: "a1", company: "Muster AG", position: "Informatiker/in EFZ", status: "saved", updatedAt: "2026-11-01", ...o });

test("deadline reminders respect the window and status", () => {
  const r = computeReminders([app({ deadline: "2026-11-08" }), app({ id: "a2", deadline: "2026-11-30" }), app({ id: "a3", deadline: "2026-11-07", status: "applied", updatedAt: "2026-11-06" }), app({ id: "a4", deadline: "2026-11-07", status: "rejected" })], DEFAULT_SETTINGS, "2026-11-06");
  assert.deepEqual(r.map((x) => x.applicationId), ["a1"]);
  assert.equal(r[0].title, "Frist in 2 Tagen");
});
test("missed deadline stays for a week, then drops", () => {
  assert.equal(computeReminders([app({ deadline: "2026-11-01" })], DEFAULT_SETTINGS, "2026-11-06").length, 1);
  assert.equal(computeReminders([app({ deadline: "2026-10-20" })], DEFAULT_SETTINGS, "2026-11-06").length, 0);
});
test("stale: 14 days without update for sent applications only", () => {
  const r = computeReminders([app({ status: "applied", updatedAt: "2026-10-20" }), app({ id: "b", status: "applied", updatedAt: "2026-10-30" }), app({ id: "c", status: "saved", updatedAt: "2026-09-01" })], DEFAULT_SETTINGS, "2026-11-06");
  assert.deepEqual(r.map((x) => [x.applicationId, x.title]), [["a1", "17 Tage kein Update"]]);
});
test("settings are clamped", () => {
  assert.deepEqual(normalizeSettings({ days_before: 999, stale_days: 1, push: true }), { ...DEFAULT_SETTINGS, daysBefore: 30, staleDays: 3, push: true });
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
});
test("ics is valid-looking, escaped, folded, CRLF", () => {
  const ics = buildIcs([{ id: "x_1", company: "Müller; Söhne, AG", position: "Koch/Köchin " + "x".repeat(120), deadline: "2026-12-31", jobUrl: "https://e.ch/j" }], { stamp: new Date("2026-11-06T10:00:00Z") });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\n/); assert.match(ics, /DTEND;VALUE=DATE:20270101\r\n/);
  assert.match(ics, /DTSTAMP:20261106T100000Z/);
  assert.ok(ics.includes("Müller\; Söhne\\, AG"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(buildIcs([{ id: "z", company: "A", position: "B", deadline: "kaputt" }]).includes("VEVENT"), false);
});
test("feed tokens: long, url-safe, unique", () => {
  const a = newFeedToken(); assert.ok(isFeedToken(a)); assert.notEqual(a, newFeedToken());
  assert.equal(isFeedToken("short"), false); assert.equal(isFeedToken("../../etc/passwd" + "a".repeat(30)), false);
});
test("digest text lists all reminders", () => {
  const d = digestText(computeReminders([app({ deadline: "2026-11-07" })], DEFAULT_SETTINGS, "2026-11-06"), "https://x.ch");
  assert.match(d.subject, /1 Erinnerung/); assert.match(d.text, /Frist morgen/); assert.match(d.text, /https:\/\/x\.ch\/dashboard/);
});

test("vapid JWT verifies with the public key", () => {
  const k = { ...generateVapidKeys(), subject: "mailto:a@b.ch" };
  const jwt = vapidJwt("https://push.example", k, 1_800_000_000_000); const [h, b, s] = jwt.split(".");
  const pub = Buffer.from(k.publicKey, "base64url");
  const key = createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
  assert.ok(verify("sha256", Buffer.from(`${h}.${b}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  assert.equal(JSON.parse(Buffer.from(b, "base64url")).aud, "https://push.example");
});
test("web push payload decrypts for the subscriber (RFC 8291)", () => {
  const ua = createECDH("prime256v1"); ua.generateKeys(); const auth = randomBytes(16);
  const sub = { endpoint: "https://push.example/x", p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
  const body = encryptPayload(Buffer.from('{"title":"Hi"}'), sub);
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const h = (k, d) => createHmac("sha256", k).update(d).digest(); const x = (p, i, n) => h(p, Buffer.concat([i, Buffer.from([1])])).subarray(0, n);
  const ikm = x(h(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32);
  const prk = h(salt, ikm);
  const d = createDecipheriv("aes-128-gcm", x(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16), x(prk, Buffer.from("Content-Encoding: nonce\0"), 12));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain.subarray(0, plain.length - 1).toString(), '{"title":"Hi"}'); assert.equal(plain[plain.length - 1], 2);
});

test("mail: no-op without SMTP env, mime encodes non-ascii subject", async () => {
  assert.equal(smtpConfigFromEnv({}), null); assert.equal(noopMailer.configured, false);
  await noopMailer.send({ to: "a@b.ch", subject: "s", text: "t" });
  assert.ok(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "x@y.ch" }));
  assert.match(buildMime("x@y.ch", { to: "a@b.ch", subject: "Erinnerung für dich", text: "Grüsse" }), /Subject: =\?UTF-8\?B\?/);
});

test("SQL: reminder tables are RLS-isolated per user; reminder_log is invisible to users", async () => {
  const { PGlite } = await import("@electric-sql/pglite"); const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../supabase/migrations/", import.meta.url); const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $a$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $a$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $s$ select string_to_array($1, '/') $s$;
    grant usage on schema auth to authenticated;`);
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.exec('grant all on all tables in schema public to authenticated'); // Supabase default privileges; RLS is what is tested
  await db.exec(`insert into auth.users (id, email) values ('${A}','a@x.ch'),('${B}','b@x.ch')`);
  const as = async (u) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [u]); await db.exec("set role authenticated"); };
  await as(A);
  await db.exec(`insert into public.reminder_settings (user_id) values ('${A}')`);
  await db.exec(`insert into public.calendar_feeds (user_id, token) values ('${A}', '${"t".repeat(40)}')`);
  await assert.rejects(db.exec(`insert into public.calendar_feeds (user_id, token) values ('${A}', 'short')`));
  await assert.rejects(db.exec(`insert into public.calendar_feeds (user_id, token) values ('${B}', '${"u".repeat(40)}')`), "cannot create feeds for others");
  await as(B);
  assert.equal((await db.query("select * from public.calendar_feeds")).rows.length, 0);
  assert.equal((await db.query("select * from public.reminder_settings")).rows.length, 0);
  await db.exec("delete from public.calendar_feeds");
  await as(A);
  assert.equal((await db.query("select * from public.calendar_feeds")).rows.length, 1, "B could not revoke A's feed");
  assert.equal((await db.query("select * from public.reminder_log")).rows.length, 0);
  await assert.rejects(db.exec(`insert into public.reminder_log (user_id, application_id, kind, due_on, channel) values ('${A}','x','stale','2026-11-01','email')`), "users cannot write the send log");
});
