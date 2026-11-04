import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canPlaceMapItem, findFreeMapPosition, isMapShopSetupError, itemFootprint, shopCatalog, villageObjects } from "../lib/map-shop.ts";

const fountain = { id: "fountain-1", itemType: "fountain", x: 20, z: 0, rotation: 0, createdAt: "2026-11-04" };

test("missing shop schema is distinguished from network and permission errors", () => {
  for (const code of ["PGRST202", "PGRST205", "42883", "42P01"]) assert.equal(isMapShopSetupError({ code }), true);
  for (const reason of [null, new Error("offline"), { code: "42501" }, { code: "PGRST301" }]) assert.equal(isMapShopSetupError(reason), false);
});

test("shop has affordable roads, decoration, a fountain and an amusement park", () => {
  assert.equal(shopCatalog.road.price, 20);
  assert.equal(shopCatalog.amusement_park.price, 500);
  assert.equal(Object.keys(shopCatalog).length, 6);
  assert.deepEqual(itemFootprint("bench", 1), { width: 1, depth: 2 });
});

test("placement rejects invalid coordinates, occupied cells and out-of-bounds footprints", () => {
  const item = { id: "new", itemType: "bench" };
  for (const position of [{ x: -11, z: 0, rotation: 0 }, { x: 32, z: 0, rotation: 0 }, { x: 20, z: 1, rotation: 0 }, { x: 20.5, z: 4, rotation: 0 }, { x: NaN, z: 4, rotation: 0 }, { x: 25, z: 4, rotation: 4 }, { x: 25, z: 20, rotation: 0 }]) {
    assert.equal(canPlaceMapItem(item, position, [fountain]), false);
  }
  assert.equal(canPlaceMapItem(item, { x: 22, z: 0, rotation: 0 }, [fountain]), true);
  assert.equal(canPlaceMapItem(item, { x: 31, z: 0, rotation: 1 }, [fountain]), true);
  assert.equal(canPlaceMapItem(fountain, { x: 20, z: 0, rotation: 0 }, [fountain]), true);
});

test("free position search avoids stored and placed inventory footprints", () => {
  const item = { id: "park", itemType: "amusement_park" };
  const inventory = [{ ...fountain, x: 18, z: -5 }, { ...fountain, id: "stored", x: null, z: null }];
  const position = findFreeMapPosition(item, inventory);
  assert.ok(position);
  assert.equal(canPlaceMapItem(item, position, inventory), true);
  assert.equal(position.x, -9);
});

test("decorations fit between houses and layouts move houses and default streets", () => {
  const applications = Array.from({ length: 3 }, (_, index) => ({ id: `app-${index}`, company: `Firma ${index}`, position: "Stelle", category: "software", status: "applied", createdAt: "2026-11-04", updatedAt: "2026-11-04" }));
  const objects = villageObjects(applications);
  const house = objects.find(({ itemType }) => itemType === "house");
  const street = objects.find(({ itemType }) => itemType === "street");
  assert.equal(canPlaceMapItem(fountain, { x: 2, z: 0, rotation: 0 }, objects), true);
  assert.equal(canPlaceMapItem(fountain, { x: house.x, z: house.z, rotation: 0 }, objects), false);
  assert.equal(canPlaceMapItem(fountain, { x: street.x, z: street.z, rotation: 0 }, objects), false);
  assert.equal(canPlaceMapItem(house, { x: 20, z: 0, rotation: 1 }, objects), true);
  const moved = villageObjects(applications, [{ id: house.id, x: 20, z: 0, rotation: 1 }]);
  assert.equal(canPlaceMapItem(fountain, { x: house.x, z: house.z, rotation: 0 }, moved), true);
  assert.equal(canPlaceMapItem(street, { x: 20, z: 0, rotation: 0 }, moved), false);
  assert.equal(canPlaceMapItem(street, { x: 18, z: 0, rotation: 0 }, moved), false);
});

test("PostgreSQL rewards once, debits safely and enforces placement and ownership", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
      create table storage.buckets (id text primary key, name text, public boolean);
      create table storage.objects (bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
      grant usage on schema auth to authenticated;
    `);
    const schema = (await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8")) + "\n" + (await readFile(new URL("../supabase/migrations/20261104000001_lock_streets.sql", import.meta.url), "utf8"));
    await database.exec(schema);
    const user = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    await database.query("insert into auth.users values ($1), ($2)", [user, other]);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    const state = async () => (await database.query("select public.map_shop_state() as state")).rows[0].state;
    const insert = async (id, status, owner = user) => database.query("insert into public.applications (id,user_id,company,position,category,status,created_at,updated_at) values ($1,$2,'Firma','Stelle','software',$3,current_date,current_date)", [id, owner, status]);
    await insert("draft", "saved");
    assert.equal((await state()).balance, 0);
    await database.query("update public.applications set status = 'applied' where id = 'draft'");
    await database.query("update public.applications set status = 'saved' where id = 'draft'");
    await database.query("update public.applications set status = 'offer' where id = 'draft'");
    assert.equal((await state()).balance, 100);
    await insert("second", "interview");
    await insert("third", "rejected");
    await insert("withdrawn", "withdrawn");
    assert.equal((await state()).balance, 300);
    const applicationRows = (await database.query("select id, company, created_at::text from public.applications where user_id = $1 order by created_at, id", [user])).rows;
    const clientObjects = villageObjects(applicationRows.map((row) => ({ id: row.id, company: row.company, createdAt: row.created_at })));
    const serverObjects = (await database.query("select * from public.map_village_objects($1)", [user])).rows;
    assert.deepEqual(serverObjects.map(({ id, item_type, x, z, rotation }) => ({ id, itemType: item_type, x, z, rotation })).sort((first, second) => first.id.localeCompare(second.id)), clientObjects.map(({ id, itemType, x, z, rotation }) => ({ id, itemType, x, z, rotation })).sort((first, second) => first.id.localeCompare(second.id)));
    await database.exec(schema);
    assert.equal((await state()).balance, 300);
    const catalog = (await database.query("select * from public.map_shop_catalog")).rows;
    for (const row of catalog) assert.deepEqual({ price: row.price, width: row.width, depth: row.depth }, { price: shopCatalog[row.item_type].price, width: shopCatalog[row.item_type].width, depth: shopCatalog[row.item_type].depth });
    const fountainId = "10000000-0000-4000-8000-000000000001";
    const benchId = "10000000-0000-4000-8000-000000000002";
    await database.query("select public.map_shop_buy('fountain', $1)", [fountainId]);
    await database.query("select public.map_shop_buy('fountain', $1)", [fountainId]);
    assert.equal((await state()).balance, 150);
    assert.equal((await state()).items.length, 1);
    await assert.rejects(database.query("select public.map_shop_buy('amusement_park', $1)", [benchId]), /INSUFFICIENT_POINTS/);
    await assert.rejects(database.query("select public.map_shop_buy('invalid', $1)", [benchId]), /INVALID_ITEM/);
    assert.equal((await state()).balance, 150);
    await database.query("select public.map_shop_buy('bench', $1)", [benchId]);
    await database.query("select public.map_shop_place($1,20,0,0)", [fountainId]);
    await assert.rejects(database.query("select public.map_shop_place($1,21,0,0)", [benchId]), /POSITION_OCCUPIED/);
    await assert.rejects(database.query("select public.map_shop_place($1,32,0,0)", [benchId]), /INVALID_POSITION/);
    await database.query("select public.map_shop_place($1,31,0,1)", [benchId]);
    const stored = await state();
    assert.equal(stored.items.find(({ id }) => id === benchId).rotation, 1);
    await database.query("select public.map_shop_place($1,null,null,0)", [fountainId]);
    assert.equal((await state()).items.find(({ id }) => id === fountainId).x, null);
    await database.query("select public.map_shop_place($1,2,0,0)", [fountainId]);
    await assert.rejects(database.query("select public.map_move_object('house:draft',2,0,0)"), /POSITION_OCCUPIED/);
    await database.query("select public.map_move_object('house:draft',20,8,1)");
    assert.equal((await state()).layouts.find(({ id }) => id === "house:draft").x, 20);
    const streetId = clientObjects.find(({ itemType }) => itemType === "street").id;
    await assert.rejects(database.query("select public.map_move_object($1,18,0,0)", [streetId]), /STREET_LOCKED/);
    assert.equal((await state()).layouts.find(({ id }) => id === streetId), undefined);
    await assert.rejects(database.query("insert into public.map_layouts(user_id, object_id, x, z) values ($1, $2, 18, 0)", [user, streetId]), /STREET_LOCKED/);
    await assert.rejects(database.query("update public.map_layouts set object_id = $1 where object_id = 'house:draft'", [streetId]), /STREET_LOCKED/);
    await assert.rejects(database.query("select public.map_move_object('house:unknown',20,8,0)"), /ITEM_NOT_OWNED/);
    await database.query("delete from public.applications where id = 'draft'");
    await insert("draft", "applied");
    assert.equal((await state()).earned, 300);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await state()).balance, 0);
    await assert.rejects(database.query("select public.map_shop_place($1,22,0,0)", [benchId]), /ITEM_NOT_OWNED/);
    await assert.rejects(database.query("select public.map_move_object('house:second',20,0,0)"), /ITEM_NOT_OWNED/);
    await database.exec("set role authenticated");
    assert.equal((await database.query("select * from public.map_items")).rows.length, 0);
    await assert.rejects(database.query("update public.map_wallets set balance=9999"), /permission denied/);
    await database.exec("reset role");
    await database.exec("drop trigger reward_submitted_application on public.applications");
    await insert("historical", "applied");
    await database.exec(schema);
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    assert.equal((await state()).earned, 400);
    await database.exec(schema);
    assert.equal((await state()).earned, 400);
    await database.query("select set_config('request.jwt.claim.sub', '', false)");
    await assert.rejects(state(), /AUTH_REQUIRED/);
  } finally {
    await database.close();
  }
});
test("streets are fixed: layouts never move them and they cannot be placed", () => {
  const base = villageObjects([]);
  const street = base.find(({ itemType }) => itemType === "street");
  const moved = villageObjects([], [{ id: street.id, x: 18, z: 0, rotation: 1 }]);
  const same = moved.find(({ id }) => id === street.id);
  assert.deepEqual([same.x, same.z, same.rotation], [street.x, street.z, street.rotation]);
  assert.equal(canPlaceMapItem(street, { x: 25, z: 25, rotation: 0 }, base, 40), false);
});
