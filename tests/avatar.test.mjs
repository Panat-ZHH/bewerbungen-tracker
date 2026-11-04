import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { AVATAR_MAX_BYTES, avatarPath, baseScale, clampOffset, clampZoom, outputSize, pathFromAvatarUrl, sourceRect, validateAvatarFile, withVersion } from "../lib/avatar.ts";

test("files are validated by type and size with German messages", () => {
  assert.deepEqual(validateAvatarFile({ type: "image/png", size: 1000 }), { ok: true });
  assert.deepEqual(validateAvatarFile({ type: "image/webp", size: AVATAR_MAX_BYTES }), { ok: true });
  const gif = validateAvatarFile({ type: "image/gif", size: 1000 });
  assert.equal(gif.ok, false);
  assert.match(gif.message, /PNG|JPEG|WebP/);
  const big = validateAvatarFile({ type: "image/jpeg", size: AVATAR_MAX_BYTES + 1 });
  assert.equal(big.ok, false);
  assert.match(big.message, /5 MB/);
  assert.equal(validateAvatarFile({ type: "image/png", size: 0 }).ok, false);
});

test("paths live in the user folder and URLs get a cache-busting version", () => {
  assert.equal(avatarPath("u-1", "image/webp"), "u-1/avatar.webp");
  assert.equal(avatarPath("u-1", "image/jpeg"), "u-1/avatar.jpg");
  assert.equal(withVersion("https://x.supabase.co/storage/v1/object/public/avatars/u-1/avatar.webp?v=1", 2), "https://x.supabase.co/storage/v1/object/public/avatars/u-1/avatar.webp?v=2");
  assert.equal(pathFromAvatarUrl("https://x.supabase.co/storage/v1/object/public/avatars/u-1/avatar.webp?v=2"), "u-1/avatar.webp");
  assert.equal(pathFromAvatarUrl("https://elsewhere/pic.png"), undefined);
});

test("crop geometry keeps the image covering the square and exports the visible area", () => {
  const image = { width: 2000, height: 1000 };
  assert.equal(baseScale(image, 280), 0.28);
  assert.equal(clampZoom(10), 4);
  assert.equal(clampZoom(0), 1);
  // Landscape at zoom 1: free horizontally (+-140), locked vertically.
  assert.deepEqual(clampOffset({ x: 9999, y: 50 }, image, 280, 1), { x: 140, y: 0 });
  assert.deepEqual(clampOffset({ x: 0, y: 500 }, image, 280, 2), { x: 0, y: 140 });
  // Centered, zoom 1: the square is the middle 1000x1000 of the source.
  let rect = sourceRect(image, 280, 1, { x: 0, y: 0 });
  [rect.sx, rect.sy, rect.side].forEach((value, i) => assert.ok(Math.abs(value - [500, 0, 1000][i]) < 1e-6));
  // Zoom 2 halves the side; dragging the image right by 100px shows more of the left side.
  rect = sourceRect(image, 280, 2, { x: 100, y: 0 });
  assert.ok(Math.abs(rect.side - 500) < 1e-6);
  assert.ok(Math.abs(rect.sx - (750 - 100 / 0.56)) < 1e-9);
  // Out-of-range offsets are clamped, so the rect never leaves the image.
  rect = sourceRect(image, 280, 1, { x: -99999, y: 99999 });
  assert.ok(rect.sx >= 0 && rect.sx + rect.side <= 2000 && rect.sy >= 0 && rect.sy + rect.side <= 1000);
  assert.equal(outputSize(3000), 512);
  assert.equal(outputSize(200), 200);
});

const ids = { a: "00000000-0000-4000-8000-0000000000a1", b: "00000000-0000-4000-8000-0000000000b2", c: "00000000-0000-4000-8000-0000000000c3", t: "00000000-0000-4000-8000-0000000000d4" };

async function setup() {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated; grant usage on schema storage to authenticated;
  `);
  for (const file of ["schema.sql", "social.sql"]) await database.exec(await readFile(new URL(`../supabase/${file}`, import.meta.url), "utf8"));
  const migration = await readFile(new URL("../supabase/migrations/20261105000000_profile_avatars.sql", import.meta.url), "utf8");
  await database.exec(migration);
  await database.exec(migration); // idempotent
  await database.query(`insert into auth.users values ($1,'a@x.ch','{"full_name":"Anna"}'), ($2,'b@x.ch','{"full_name":"Ben"}'), ($3,'c@x.ch','{"full_name":"Cara"}'), ($4,'t@x.ch','{"full_name":"Tina","role":"teacher"}')`, [ids.a, ids.b, ids.c, ids.t]);
  for (const [id, name] of Object.entries(ids)) await database.query("insert into public.profiles (id, user_id, first_name, last_name, email, avatar_url) values ($1,$2,$3,'','',$4)", [`profile-${id}`, ids[id], name, `https://x/storage/v1/object/public/avatars/${ids[id]}/avatar.webp?v=1`]);
  const as = async (user) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]); await database.exec("set role authenticated"); };
  return { database, as };
}

test("migration creates a public avatars bucket with limits", async () => {
  const { database } = await setup();
  const { rows } = await database.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].public, true);
  assert.equal(Number(rows[0].file_size_limit), 1048576);
  assert.deepEqual(rows[0].allowed_mime_types, ["image/png", "image/jpeg", "image/webp"]);
});

test("storage policies only allow writes inside the own <user_id>/ folder", async () => {
  const { database, as } = await setup();
  await as(ids.a);
  await database.query("insert into storage.objects values ('avatars', $1)", [`${ids.a}/avatar.webp`]);
  await assert.rejects(database.query("insert into storage.objects values ('avatars', $1)", [`${ids.b}/avatar.webp`]), /row-level security/);
  await assert.rejects(database.query("insert into storage.objects values ('avatars', 'avatar.webp')"), /row-level security/);
  await assert.rejects(database.query("insert into storage.objects values ('other', $1)", [`${ids.a}/x`]), /row-level security/);
  await as(ids.b);
  await database.query("insert into storage.objects values ('avatars', $1)", [`${ids.b}/avatar.png`]);
  assert.equal((await database.query("update storage.objects set name = name where name like $1", [`${ids.a}/%`])).affectedRows, 0);
  assert.equal((await database.query("delete from storage.objects where name like $1", [`${ids.a}/%`])).affectedRows, 0);
  assert.equal((await database.query("delete from storage.objects where name like $1", [`${ids.b}/%`])).affectedRows, 1);
  await as(ids.a);
  assert.equal((await database.query("delete from storage.objects where name like $1", [`${ids.a}/%`])).affectedRows, 1);
});

test("avatar URLs are only visible for self, accepted friends and the teacher of a class", async () => {
  const { database, as } = await setup();
  await database.exec("reset role");
  await database.query("insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted'), ($1,$3,'pending')", [ids.a, ids.b, ids.c]);
  await database.query("insert into public.classes (id, teacher_id, name, join_code) values ('00000000-0000-4000-8000-0000000000e5', $1, 'Klasse', 'JOIN1234')", [ids.t]);
  await database.query("insert into public.class_members (class_id, student_id) values ('00000000-0000-4000-8000-0000000000e5', $1)", [ids.a]);
  const all = [ids.a, ids.b, ids.c, ids.t];
  const visible = async (user) => { await as(user); return (await database.query("select user_id from public.social_avatars($1) order by user_id", [all])).rows.map((row) => row.user_id); };
  assert.deepEqual(await visible(ids.a), [ids.a, ids.b]);
  assert.deepEqual(await visible(ids.b), [ids.a, ids.b]);
  assert.deepEqual(await visible(ids.c), [ids.c]); // pending request is not enough
  assert.deepEqual(await visible(ids.t), [ids.a, ids.t]); // teacher sees class members, not Ben
  await as(null);
  await assert.rejects(database.query("select * from public.social_avatars($1)", [all]), /AUTH_REQUIRED/);
  await database.exec("reset role; set role anon");
  await assert.rejects(database.query("select * from public.social_avatars($1)", [all]), /permission denied/);
});

test("users can only change avatar_url on their own profile row", async () => {
  const { database, as } = await setup();
  await as(ids.a);
  assert.equal((await database.query("update public.profiles set avatar_url = null where user_id = $1", [ids.a])).affectedRows, 1);
  assert.equal((await database.query("update public.profiles set avatar_url = 'https://evil' where user_id = $1", [ids.b])).affectedRows, 0);
});
