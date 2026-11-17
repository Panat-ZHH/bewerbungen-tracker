import assert from "node:assert/strict";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canPlaceMapItem, findFreeMapPosition, isShopItemType, isUnknownShopItemError, itemFootprint, SHOP_ITEM_SOON, shopBuyErrorMessage, shopCatalog, shopCategories, shopItemsByCategory, shopRarities, unavailableShopItems } from "../lib/map-shop.ts";

const dir = new URL("../supabase/migrations/", import.meta.url);
const MIGRATION = "20261115000000_shop_cars_scooters.sql";
const types = Object.keys(shopCatalog);
const cars = types.filter((type) => type.startsWith("car_"));
const scooters = types.filter((type) => type.startsWith("scooter_"));

function parseMigration(sql) {
  return [...sql.matchAll(/\('([a-z0-9_]+)',\s*(\d+),\s*(\d+),\s*(\d+)\)/g)].map(([, itemType, price, width, depth]) => ({ itemType, price: Number(price), width: Number(width), depth: Number(depth) }));
}

test("catalogue keeps the six original items unchanged", () => {
  assert.deepEqual(
    ["road", "flowers", "tree", "bench", "fountain", "amusement_park"].map((type) => [type, shopCatalog[type].price, shopCatalog[type].width, shopCatalog[type].depth]),
    [["road", 20, 1, 1], ["flowers", 30, 1, 1], ["tree", 40, 1, 1], ["bench", 50, 2, 1], ["fountain", 150, 2, 2], ["amusement_park", 500, 4, 4]],
  );
});

test("eight sports-car brands with 2x1 footprint, tiered prices and rarity", () => {
  assert.equal(cars.length, 8);
  for (const brand of ["Ferraro", "Lamborgino", "Porscha", "McLarin", "Aston-Marlin", "Bugotti", "Mercedo-AMX", "Auda-R9"]) assert.ok(cars.some((type) => shopCatalog[type].name.startsWith(brand)), brand);
  for (const type of cars) {
    const item = shopCatalog[type];
    assert.equal(item.category, "Autos");
    assert.deepEqual([item.width, item.depth], [2, 1]);
    assert.ok(item.price >= 300 && item.price <= 3000, `${type} ${item.price}`);
  }
  assert.ok(shopCatalog.car_bugatti.price > shopCatalog.car_lamborghini.price);
  assert.ok(shopCatalog.car_ferrari.price > shopCatalog.car_mclaren.price);
  assert.ok(shopCatalog.car_mclaren.price > shopCatalog.car_porsche.price);
  assert.equal(shopCatalog.car_bugatti.rarity, "legendaer");
  assert.equal(shopCatalog.car_porsche.rarity, "selten");
  assert.deepEqual(itemFootprint("car_ferrari", 1), { width: 1, depth: 2 });
});

test("at least six e-scooters (3 models) with 1x1 footprint and cheap prices", () => {
  assert.ok(scooters.length >= 6);
  assert.deepEqual(new Set(scooters.map((type) => type.split("_")[1])), new Set(["city", "sport", "retro"]));
  for (const type of scooters) {
    const item = shopCatalog[type];
    assert.equal(item.category, "E-Roller");
    assert.deepEqual([item.width, item.depth], [1, 1]);
    assert.ok(item.price >= 60 && item.price <= 250);
    assert.ok(["gewoehnlich", "selten"].includes(item.rarity));
  }
});

test("every item has a snake_case id, a known category and rarity, and German labels", () => {
  for (const type of types) {
    assert.match(type, /^[a-z][a-z0-9_]*$/);
    assert.ok(shopCategories.includes(shopCatalog[type].category), type);
    assert.ok(shopCatalog[type].rarity in shopRarities, type);
    assert.ok(!/ß/.test(shopCatalog[type].name), "Swiss spelling, no ß");
  }
  assert.equal(isShopItemType("car_ferrari"), true);
  assert.equal(isShopItemType("toString"), false);
  assert.equal(isShopItemType("car_trabant"), false);
});

test("category filter returns the right items, sorted by price", () => {
  const all = shopItemsByCategory();
  assert.equal(all.length, types.length);
  for (let index = 1; index < all.length; index++) assert.ok(all[index - 1].price <= all[index].price);
  assert.deepEqual(shopItemsByCategory("Autos").map(({ type }) => type).sort(), [...cars].sort());
  assert.deepEqual(shopItemsByCategory("E-Roller").map(({ type }) => type).sort(), [...scooters].sort());
  assert.equal(shopCategories.reduce((sum, category) => sum + shopItemsByCategory(category).length, 0), types.length);
  assert.equal(shopItemsByCategory("Autos")[0].type, "car_porsche");
  assert.equal(shopItemsByCategory("Autos").at(-1).type, "car_bugatti");
});

test("rotated cars place correctly and the free-slot search finds room", () => {
  const car = { id: "car", itemType: "car_lamborghini" };
  const parked = { id: "other", itemType: "car_ferrari", x: 20, z: 0, rotation: 1, createdAt: "" };
  assert.equal(canPlaceMapItem(car, { x: 20, z: 1, rotation: 0 }, [parked]), false);
  assert.equal(canPlaceMapItem(car, { x: 21, z: 0, rotation: 1 }, [parked]), true);
  assert.equal(canPlaceMapItem(car, { x: 31, z: 0, rotation: 0 }, [parked]), true);
  assert.equal(canPlaceMapItem(car, { x: 32, z: 0, rotation: 0 }, [parked]), false);
  const position = findFreeMapPosition(car, [parked]);
  assert.ok(position && canPlaceMapItem(car, position, [parked]));
});

test("unknown item errors become a friendly 'bald erhältlich' message", () => {
  const invalid = Object.assign(new Error("Database error: P0001 | INVALID_ITEM"), { code: "P0001" });
  assert.equal(isUnknownShopItemError(invalid), true);
  assert.equal(isUnknownShopItemError({ code: "23503", message: "violates foreign key constraint" }), true);
  assert.equal(shopBuyErrorMessage(invalid), SHOP_ITEM_SOON);
  assert.equal(SHOP_ITEM_SOON, "Dieses Modell ist bald erhältlich.");
  assert.match(shopBuyErrorMessage(new Error("Database error: P0001 | INSUFFICIENT_POINTS")), /nicht genügend Punkte/);
  assert.match(shopBuyErrorMessage(new Error("offline")), /nicht bestätigt/);
  for (const reason of [null, undefined, "x", { code: "42501" }]) assert.equal(isUnknownShopItemError(reason), false);
});

test("items missing from the server catalogue are flagged; unreadable catalogue flags nothing", () => {
  const old = ["road", "flowers", "tree", "bench", "fountain", "amusement_park"].map((item_type) => ({ item_type }));
  const missing = unavailableShopItems(old);
  assert.deepEqual([...missing].sort(), [...cars, ...scooters].sort());
  assert.equal(unavailableShopItems(types.map((item_type) => ({ item_type }))).size, 0);
  assert.equal(unavailableShopItems(null).size, 0);
  assert.equal(unavailableShopItems([]).size, 0);
});

test("migration is additive only and matches shopCatalog exactly", async () => {
  const sql = await readFile(new URL(MIGRATION, dir), "utf8");
  const code = sql.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /\b(drop|alter|update|delete|truncate|grant|revoke)\b/i);
  assert.match(code, /insert into public\.map_shop_catalog \(item_type, price, width, depth\) values/);
  assert.match(code, /on conflict \(item_type\) do nothing;\s*$/);
  const rows = parseMigration(code);
  assert.deepEqual(rows.map(({ itemType }) => itemType).sort(), [...cars, ...scooters].sort());
  for (const row of rows) assert.deepEqual({ price: row.price, width: row.width, depth: row.depth }, { price: shopCatalog[row.itemType].price, width: shopCatalog[row.itemType].width, depth: shopCatalog[row.itemType].depth }, row.itemType);
});

test("PostgreSQL: buying a car fails cleanly before the migration and works after it", async () => {
  const db = new PGlite();
  try {
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
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    assert.ok(files.includes(MIGRATION));
    for (const file of files.filter((name) => name < MIGRATION)) await db.exec(await readFile(new URL(file, dir), "utf8"));
    const user = "00000000-0000-4000-8000-0000000000c3";
    await db.query("insert into auth.users (id, email) values ($1, 'test@example.ch')", [user]);
    await db.query("insert into public.map_wallets (user_id, balance, earned) values ($1, 2000, 2000) on conflict (user_id) do update set balance = 2000", [user]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    const balance = async () => (await db.query("select balance from public.map_wallets where user_id = $1", [user])).rows[0].balance;
    const carId = "20000000-0000-4000-8000-000000000001";
    let failure;
    await db.query("select public.map_shop_buy('car_ferrari', $1)", [carId]).catch((error) => { failure = error; });
    assert.ok(failure, "buy must fail without the catalogue row");
    assert.equal(isUnknownShopItemError(failure), true);
    assert.equal(await balance(), 2000, "no points deducted");

    const migration = await readFile(new URL(MIGRATION, dir), "utf8");
    await db.exec(migration);
    await db.exec(migration); // idempotent
    assert.equal((await db.query("select count(*)::int as n from public.map_shop_catalog")).rows[0].n, types.length);
    for (const row of (await db.query("select * from public.map_shop_catalog")).rows) {
      assert.deepEqual([row.price, row.width, row.depth], [shopCatalog[row.item_type].price, shopCatalog[row.item_type].width, shopCatalog[row.item_type].depth], row.item_type);
    }
    await db.query("select public.map_shop_buy('car_ferrari', $1)", [carId]);
    assert.equal(await balance(), 400);
    await assert.rejects(db.query("select public.map_shop_buy('car_bugatti', $1)", ["20000000-0000-4000-8000-000000000002"]), /INSUFFICIENT_POINTS/);
    await db.query("select public.map_shop_buy('scooter_retro_sky', $1)", ["20000000-0000-4000-8000-000000000003"]);
    assert.equal(await balance(), 180);
    await db.query("select public.map_shop_place($1, 20, 0, 1)", [carId]);
    const placed = (await db.query("select x, z, rotation from public.map_items where id = $1", [carId])).rows[0];
    assert.deepEqual(placed, { x: 20, z: 0, rotation: 1 });
    await assert.rejects(db.query("select public.map_shop_place($1, 20, 1, 0)", ["20000000-0000-4000-8000-000000000003"]), /POSITION_OCCUPIED/);
  } finally {
    await db.close();
  }
});

test("shop: no real car brand or model names in user-visible item names (trademark risk)", () => {
  const banned = /porsche|ferrari|lamborghini|mclaren|aston.?martin|bugatti|mercedes|\bamg\b|\baudi\b|\br8\b|bmw|tesla|volkswagen|\bvw\b|maserati|bentley|rolls.?royce|jaguar|lotus|koenigsegg|pagani|corvette|mustang|vespa/i;
  for (const [type, entry] of Object.entries(shopCatalog)) assert.doesNotMatch(entry.name, banned, type);
});
