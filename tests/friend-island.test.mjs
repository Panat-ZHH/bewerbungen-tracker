import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { friendIslandError, mockFriendIsland, parseFriendIsland } from "../lib/friend-island.ts";
import { lockedDrag } from "../lib/map-readonly.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("parseFriendIsland replaces company/position with neutral labels and drops unknown data", () => {
  const island = parseFriendIsland({
    userId: "u", displayName: "Mia", islands: 3,
    applications: [{ id: "h0001", status: "offer", createdAt: "2026-10-01", company: "Secret AG", position: "CEO", notes: "geheim" }, { id: "h0002", status: "bogus" }, { id: "h0003", status: "applied", createdAt: "2026-10-02" }],
    items: [{ id: "i1", itemType: "tree", x: 1, z: 2, rotation: 0, createdAt: "" }, { id: "i2", itemType: "evil" }],
    layouts: [{ id: "house:h0001", x: 1, z: 2, rotation: 1 }, { id: "x" }],
  });
  assert.deepEqual(island.applications.map((a) => [a.company, a.position, a.status]), [["Haus 1", "", "offer"], ["Haus 2", "", "applied"]]);
  const text = JSON.stringify(island);
  for (const secret of ["Secret AG", "CEO", "geheim"]) assert.ok(!text.includes(secret));
  assert.equal(island.items.length, 1);
  assert.equal(island.layouts.length, 1);
  assert.equal(island.islands, 3);
  assert.throws(() => parseFriendIsland(null));
});

test("mock friend island works without Supabase and shows only neutral labels", () => {
  const island = mockFriendIsland();
  assert.ok(island.applications.length > 0);
  assert.ok(island.applications.every((a) => /^Haus \d+$/.test(a.company) && a.position === "" && !a.notes && !a.location));
});

test("German error messages", () => {
  assert.equal(friendIslandError(new Error("boom")), "Insel konnte nicht geladen werden");
  assert.match(friendIslandError(new Error("P0001 | NOT_FRIENDS")), /befreundet/);
  assert.match(friendIslandError(new Error("NOT_SHARED")), /teilt/);
});

test("read-only drag API: disabled, frozen, no mutation possible", () => {
  assert.equal(lockedDrag.enabled, false);
  assert.ok(Object.isFrozen(lockedDrag));
  assert.equal(lockedDrag.nudge("ArrowLeft"), false);
  for (const name of ["move", "reject", "confirm", "cancel", "undo"]) assert.equal(lockedDrag[name]({ x: 1, z: 1, rotation: 0 }), undefined);
  assert.throws(() => { "use strict"; lockedDrag.enabled = true; }, TypeError);
});

test("map component: readOnly overrides every mutating handler and disables keyboard/UI", async () => {
  const world = await read("../components/applications/application-map-world.tsx");
  assert.match(world, /props\.readOnly \? \{ \.\.\.props, onSelect: noopHandler, onSelectShopItem: noopHandler, onPlacePosition: noopHandler, drag: lockedDrag, placement: null/);
  assert.match(world, /if \(readOnly \|\| event\.target !== event\.currentTarget\) return;/);
  assert.match(world, /readOnly \? \(\s*<span data-building/);
});

test("friend island view imports no mutation API and no shop/edit hook", async () => {
  const view = await read("../components/friends/friend-island-view.tsx");
  const lib = await read("../lib/friend-island.ts");
  for (const source of [view, lib]) {
    assert.doesNotMatch(source, /@\/lib\/storage|lib\/storage|useMapShop|map-shop"|MapPlacementTools|MapShop\b|islands-storage|use-islands|unlockIsland|moveMapObject|placeMapItem|buyMapItem|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  }
  assert.match(lib, /rpc\("map_friend_island"/);
  assert.equal([...lib.matchAll(/\.rpc\(/g)].length, 1);
});

test("migration: read-only function checks accepted friendship, no write policies/grants, hides private columns", async () => {
  const sql = await read("../supabase/migrations/20261105000001_friend_island_view.sql");
  assert.match(sql, /f\.status = 'accepted'/);
  assert.match(sql, /share_with_friends/);
  assert.match(sql, /security definer/);
  const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /create policy|grant (insert|update|delete|all)|\b[a-z]\.(company|position|notes|location|salary_\w+|job_url|job_description)\b/i);
  assert.match(sql, /revoke all on function public\.map_friend_island\(uuid\) from public, anon/);
});

test("database: only accepted friends who share can read; data is sanitized; tables stay write-protected", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role authenticated; create role anon; create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
      grant usage on schema auth to authenticated;
    `);
    for (const file of ["../supabase/schema.sql", "../supabase/social.sql", "../supabase/migrations/20261104000001_lock_streets.sql", "../supabase/migrations/20261104000002_islands.sql", "../supabase/migrations/20261105000001_friend_island_view.sql"]) await database.exec(await read(file));
    const [me, friend, pending, stranger] = ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444"];
    for (const id of [me, friend, pending, stranger]) await database.query("insert into auth.users values ($1)", [id]);
    for (const [id, name] of [[me, "Ich"], [friend, "Freundin"], [pending, "Offen"], [stranger, "Fremd"]]) await database.query("insert into public.user_roles (user_id, display_name, invite_code) values ($1, $2, $3) on conflict (user_id) do update set display_name = excluded.display_name", [id, name, name]);
    await database.query("insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted'), ($1,$3,'pending')", [me, friend, pending]);
    await database.query("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at, notes, location) values ('acme-secret', $1, 'Acme Geheim GmbH', 'Chefin', 'software', 'offer', '2026-10-01', '2026-10-01', 'private Notiz', 'Zürich')", [friend]);
    await database.query("insert into public.map_wallets (user_id, balance, earned) values ($1, 777, 777) on conflict (user_id) do update set balance = 777", [friend]);
    await database.query("insert into public.map_items (id, user_id, item_type, price_paid, x, z) values (gen_random_uuid(), $1, 'tree', 40, 3, 3)", [friend]);
    await database.query("insert into public.map_layouts (user_id, object_id, x, z) values ($1, 'house:acme-secret', 7, 9)", [friend]);
    await database.exec("set role authenticated");
    const call = async (viewer, target) => { await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [viewer]); return database.query("select public.map_friend_island($1) as r", [target]); };

    const ok = (await call(me, friend)).rows[0].r;
    assert.equal(ok.displayName, "Freundin");
    assert.equal(ok.applications.length, 1);
    assert.equal(ok.items.length, 1);
    assert.deepEqual(ok.layouts, [{ id: "house:h0001", x: 7, z: 9, rotation: 0 }]);
    assert.deepEqual(Object.keys(ok.applications[0]).sort(), ["createdAt", "id", "status"]);
    const text = JSON.stringify(ok);
    for (const secret of ["Acme", "Geheim", "Chefin", "private Notiz", "Zürich", "acme-secret", "777"]) assert.ok(!text.includes(secret), secret);
    // the friend can see mine too (symmetric), but pending/strangers/self cannot be viewed
    assert.ok((await call(friend, me)).rows[0].r);
    for (const target of [pending, stranger, me]) await assert.rejects(call(me, target), /NOT_FRIENDS/);
    await assert.rejects(call(stranger, friend), /NOT_FRIENDS/);
    await assert.rejects(call(pending, me), /NOT_FRIENDS/);
    await database.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await assert.rejects(database.query("select public.map_friend_island($1)", [friend]), /AUTH_REQUIRED/);

    // friend is not sharing -> NOT_SHARED
    await database.exec("reset role");
    await database.query("update public.user_roles set share_with_friends = false where user_id = $1", [friend]);
    await database.exec("set role authenticated");
    await assert.rejects(call(me, friend), /NOT_SHARED/);

    // a friend cannot write or even read the other's map tables directly
    await database.query(`select set_config('request.jwt.claim.sub', $1, false)`, [me]);
    for (const statement of [
      "insert into public.map_items (id, user_id, item_type, price_paid, x, z) values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'tree', 40, 1, 1)",
      "update public.map_layouts set x = 1", "delete from public.map_layouts", "update public.map_items set x = 1", "delete from public.map_items", "update public.map_wallets set balance = 0",
    ]) await assert.rejects(database.query(statement), /permission denied|row-level security/, statement);
    const direct = await database.query("select count(*)::int as n from public.map_items where user_id = '22222222-2222-2222-2222-222222222222'");
    assert.equal(direct.rows[0].n, 0);
  } finally {
    await database.close();
  }
});
