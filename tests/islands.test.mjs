import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { ISLANDS } from "../lib/islands-config.ts";
import { canUnlockIsland, islandAt, islandCost, isPlaceableArea, nextIsland, reservedBridgeRects, unlockProgress } from "../lib/islands.ts";
import { canPlaceMapItem, findFreeMapPosition } from "../lib/map-shop.ts";

test("island costs: first island free, later islands strictly more expensive", () => {
  assert.equal(islandCost(1), 0);
  for (let no = 2; no <= ISLANDS.length; no++) assert.ok(islandCost(no) > islandCost(no - 1));
  assert.equal(islandCost(99), Infinity);
  assert.equal(nextIsland(1)?.no, 2);
  assert.equal(nextIsland(ISLANDS.length), null);
});

test("unlock affordability and progress", () => {
  const price = islandCost(2);
  assert.equal(canUnlockIsland(1, price - 1), false);
  assert.equal(canUnlockIsland(1, price), true);
  assert.equal(canUnlockIsland(1, NaN), false);
  assert.equal(canUnlockIsland(ISLANDS.length, 1e9), false);
  assert.deepEqual(unlockProgress(1, price / 2), { island: ISLANDS[1], points: price / 2, price, percent: 50, missing: price / 2 });
  assert.equal(unlockProgress(1, price * 3).points, price);
  assert.equal(unlockProgress(ISLANDS.length, 5), null);
});

test("placement: locked islands, bridge and island borders", () => {
  const bench = { id: "b", itemType: "bench" };
  const onIsland2 = { x: 45, z: 0, rotation: 0 };
  assert.equal(canPlaceMapItem(bench, onIsland2, [], 20, 1), false, "island 2 locked");
  assert.equal(canPlaceMapItem(bench, onIsland2, [], 20, 2), true);
  assert.equal(canPlaceMapItem(bench, { x: 34, z: 9, rotation: 0 }, [], 20, 2), false, "bridge");
  assert.equal(canPlaceMapItem(bench, { x: 31, z: 9, rotation: 0 }, [], 20, 2), false, "landing on island 1");
  assert.equal(canPlaceMapItem(bench, { x: 39, z: 9, rotation: 0 }, [], 20, 2), false, "landing on island 2");
  assert.equal(canPlaceMapItem(bench, { x: 32, z: 0, rotation: 0 }, [], 20, 2), false, "straddles island 1 and the sea");
  assert.equal(canPlaceMapItem(bench, { x: 37, z: 0, rotation: 0 }, [], 20, 2), false, "in the sea");
  assert.equal(canPlaceMapItem({ id: "house", itemType: "house" }, { x: 45, z: 2, rotation: 0 }, [], 20, 2), true, "houses fit on island 2");
  assert.equal(canPlaceMapItem({ id: "street:1:1", itemType: "street" }, { x: 45, z: 2, rotation: 0 }, [], 20, 2), false, "streets stay locked");
  assert.equal(isPlaceableArea(-10, -7, 1, 1), true);
  assert.equal(isPlaceableArea(-11, 0, 1, 1), false);
  assert.ok(reservedBridgeRects().length === ISLANDS.length - 1);
  assert.equal(islandAt(45, 0, 2), 2);
  assert.equal(islandAt(45, 0, 1), null);
});

test("free-position search falls back to unlocked islands when the first is full", () => {
  const park = { id: "park", itemType: "amusement_park" };
  const blockers = [];
  for (let x = -10; x < 33; x += 4) for (let z = -7; z < 20; z += 4) blockers.push({ id: `b${x}:${z}`, itemType: "amusement_park", x, z, rotation: 0 });
  assert.equal(findFreeMapPosition(park, blockers, 20, 1), null);
  const position = findFreeMapPosition(park, blockers, 20, 2);
  assert.ok(position && position.x >= 38);
});

test("islands migration: server-side unlock, RLS and bounds", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role authenticated; create role anon; create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
      grant usage on schema auth to authenticated;
    `);
    for (const file of ["../supabase/schema.sql", "../supabase/migrations/20261104000001_lock_streets.sql", "../supabase/migrations/20261104000002_islands.sql"]) await database.exec(await readFile(new URL(file, import.meta.url), "utf8"));
    const user = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    await database.query("insert into auth.users values ($1), ($2)", [user, other]);
    const as = (id) => database.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    const unlock = async (no) => (await database.query("select public.map_island_unlock($1) as s", [no])).rows[0].s;
    const balance = async (id) => (await database.query("select balance from public.map_wallets where user_id = $1", [id])).rows[0].balance;
    const catalog = (await database.query("select island_no, price, x0, z0, x1, z1, bridge_x0, bridge_z0, bridge_x1, bridge_z1 from public.map_island_catalog order by island_no")).rows;
    for (const island of ISLANDS) {
      const row = catalog.find((entry) => entry.island_no === island.no);
      assert.equal(row.price, island.price, `price ${island.no}`);
      assert.deepEqual([row.x0, row.z0, row.x1], [island.area.x0, island.area.z0, island.area.x1], `area ${island.no}`);
      if (island.no > 1) assert.deepEqual([row.z1, row.bridge_x0, row.bridge_z0, row.bridge_x1, row.bridge_z1], [island.area.z1, island.bridge.x0, island.bridge.z0, island.bridge.x1, island.bridge.z1], `bridge ${island.no}`);
    }

    await as(user);
    await database.query("select public.map_shop_state()");
    assert.deepEqual((await database.query("select public.map_islands_state() as s")).rows[0].s, { unlocked: 1 });
    await assert.rejects(unlock(2), /INSUFFICIENT_POINTS/);
    await assert.rejects(unlock(3), /ISLAND_ORDER/);
    await assert.rejects(unlock(1), /INVALID_ISLAND/);
    await database.query("update public.map_wallets set balance = $2 where user_id = $1", [user, ISLANDS[1].price + 50]);
    assert.deepEqual(await unlock(2), { unlocked: 2 });
    assert.equal(await balance(user), 50);
    assert.deepEqual(await unlock(2), { unlocked: 2 }, "idempotent");
    assert.equal(await balance(user), 50, "no double charge");
    await assert.rejects(unlock(3), /INSUFFICIENT_POINTS/);

    // Placement on island 2 works for the owner only, never on the bridge or in the sea.
    await database.query("update public.map_wallets set balance = 500 where user_id = $1", [user]);
    const bench = "20000000-0000-4000-8000-000000000001";
    await database.query("select public.map_shop_buy('bench', $1)", [bench]);
    const place = (x, z) => database.query("select public.map_shop_place($1, $2, $3, 0)", [bench, x, z]);
    await place(45, 0);
    await assert.rejects(place(34, 9), /INVALID_POSITION/);
    await assert.rejects(place(39, 9), /INVALID_POSITION/);
    await assert.rejects(place(36, 0), /INVALID_POSITION/);
    await assert.rejects(place(63, 0), /INVALID_POSITION/);

    await as(other);
    assert.deepEqual((await database.query("select public.map_islands_state() as s")).rows[0].s, { unlocked: 1 });
    const stolen = "20000000-0000-4000-8000-000000000002";
    await database.query("select public.map_shop_state()");
    await database.query("update public.map_wallets set balance = 500 where user_id = $1", [other]);
    await database.query("select public.map_shop_buy('bench', $1)", [stolen]);
    await assert.rejects(database.query("select public.map_shop_place($1, 45, 0, 0)", [stolen]), /INVALID_POSITION/, "island 2 not unlocked for the other user");

    // RLS: each user only sees their own island rows; direct writes are impossible.
    await database.exec("set role authenticated");
    assert.equal((await database.query("select count(*)::int as n from public.map_islands")).rows[0].n, 0);
    await as(user);
    assert.equal((await database.query("select count(*)::int as n from public.map_islands")).rows[0].n, 1);
    await assert.rejects(database.query("insert into public.map_islands (user_id, island_no, price_paid) values ($1, 3, 0)", [user]));
    await assert.rejects(database.query("update public.map_wallets set balance = 99999"));
    await database.exec("reset role");
  } finally {
    await database.close();
  }
});

