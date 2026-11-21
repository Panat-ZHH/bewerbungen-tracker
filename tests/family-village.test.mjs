import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { familyVillageErrorKind, familyVillagePath, familyVillageReason, parseFamilyVillage } from "../lib/family-village.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const payload = (o = {}) => ({
  child_id: "c1", display_name: "Lina Meier", island_count: 2, show_companies: true,
  houses: [
    { id: "h1", status: "offer", company: "Swisscom", notes: "geheim", salary: 5000, contact: "chef@x.ch", jobUrl: "https://x.ch" },
    { id: "h2", status: "bogus", company: "Weg AG" },
    { id: "h3", status: "applied", company: null },
  ],
  layouts: [{ id: "house:h1", x: 4, z: 8, rotation: 1 }, { id: "broken" }],
  items: [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "evil", x: 1, z: 1 }, { id: "i3", itemType: "bench", x: null, z: null, rotation: 2, createdAt: "" }],
  ...o,
});

test("parseFamilyVillage maps the RPC JSON to ApplicationMapWorld props and drops everything else", () => {
  const v = parseFamilyVillage(payload());
  assert.equal(v.childId, "c1");
  assert.equal(v.displayName, "Lina Meier");
  assert.equal(v.islandCount, 2);
  assert.equal(v.showCompanies, true);
  assert.deepEqual(v.applications.map((a) => [a.id, a.company, a.status, a.position]), [["h1", "Swisscom", "offer", ""], ["h3", "", "applied", ""]]);
  assert.deepEqual(v.layouts, [{ id: "house:h1", x: 4, z: 8, rotation: 1 }]);
  assert.deepEqual(v.items.map((i) => [i.id, i.itemType, i.x, i.z]), [["i1", "tree", 8, 12], ["i3", "bench", null, null]]);
  assert.deepEqual(v.applications.map((a) => a.createdAt), ["000000", "000001"], "createdAt keeps the RPC order (oldest first)");
  const text = JSON.stringify(v);
  for (const secret of ["geheim", "5000", "chef@x.ch", "https://x.ch", "Weg AG"]) assert.ok(!text.includes(secret), secret);
});

test("company names are never shown when the child does not share applications", () => {
  const v = parseFamilyVillage(payload({ show_companies: false }));
  assert.deepEqual(v.applications.map((a) => a.company), ["", ""]);
});

test("parseFamilyVillage clamps the island count and tolerates empty or array payloads", () => {
  assert.equal(parseFamilyVillage({ island_count: 0 }).islandCount, 1);
  assert.equal(parseFamilyVillage([{ island_count: 500, display_name: "  " }]).islandCount, 99);
  assert.equal(parseFamilyVillage({}).displayName, null);
  assert.throws(() => parseFamilyVillage(null));
});

test("errors: REAUTH_REQUIRED -> reauth, NOT_SHARED -> not_shared (+ hint reason), not my child -> not_allowed, rest -> error", () => {
  assert.equal(familyVillageErrorKind({ message: "REAUTH_REQUIRED", code: "42501" }), "reauth");
  for (const message of ["NOT_SHARED", "CONSENT_WITHDRAWN"]) assert.equal(familyVillageErrorKind({ message, code: "P0001" }), "not_shared", message);
  for (const message of ["FORBIDDEN", "NOT_FOUND", "NOT_IN_FAMILY"]) assert.equal(familyVillageErrorKind({ message, code: "P0001" }), "not_allowed", message);
  for (const hint of ["consent_pending", "consent_withdrawn", "village_off"]) assert.equal(familyVillageReason({ message: "NOT_SHARED", hint }), hint);
  assert.equal(familyVillageReason({ message: "NOT_SHARED", hint: "evil" }), null);
  assert.equal(familyVillageReason(null), null);
  assert.equal(familyVillageErrorKind({ message: "boom", code: "XX000" }), "error");
  assert.equal(familyVillageErrorKind(null), "error");
});

test("the Dorf page is read-only and only calls family_child_village", async () => {
  assert.equal(familyVillagePath("a b"), "/familie/kind/a%20b/dorf");
  const page = await read("../app/familie/kind/[id]/dorf/page.tsx");
  const lib = await read("../lib/family-village.ts");
  assert.match(page, /<ApplicationMapWorld readOnly /);
  assert.match(page, /drag=\{lockedDrag\}/);
  for (const forbidden of ["useMapShop", "ShopPanel", "map_shop", "saveLayout", "placeItem", "coins", "balance"]) assert.ok(!page.includes(forbidden), forbidden);
  assert.match(lib, /supabase\.rpc\("family_child_village", \{ p_child_id: childId \}\)/);
  assert.equal((lib.match(/\.rpc\(/g) ?? []).length, 1);
  const card = await read("../components/family/child-overview.tsx");
  assert.match(card, /data\.village \?[\s\S]*familyVillagePath\(childId\)[\s\S]*Dorf ansehen[\s\S]*: <p/);
});
