import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { familyVillageErrorKind, familyVillagePath, familyVillageReason, parseFamilyVillage } from "../lib/family-village.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const payload = (o = {}) => ({
  child_id: "c1", display_name: "Lina Meier", island_count: 2,
  houses: [
    { id: "u1-app-1", company: "Swisscom", position: "Informatikerin EFZ", location: "Bern", status: "offer", createdAt: "2026-10-01", updatedAt: "2026-10-05", appliedAt: "2026-10-02", deadline: "2026-11-30",
      notes: "geheim", salary: 5000, contact: "chef@x.ch", jobUrl: "https://x.ch", contactName: "Frau Chefin" },
    { id: "u1-app-2", status: "bogus", company: "Weg AG" },
    { id: "u1-app-3", company: "Roche", position: "Laborant", location: null, status: "rejected", createdAt: "2026-10-03", updatedAt: "2026-10-09", appliedAt: null, deadline: null },
  ],
  layouts: [{ id: "house:u1-app-1", x: 4, z: 8, rotation: 1 }, { id: "house:gone", x: 1, z: 1, rotation: 0 }, { id: "broken" }],
  items: [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "evil", x: 1, z: 1 }, { id: "i3", itemType: "bench", x: null, z: null, rotation: 2, createdAt: "" }],
  ...o,
});

test("parseFamilyVillage gives the child's own houses (real id, company, Stelle, real status, dates) and drops everything else", () => {
  const v = parseFamilyVillage(payload());
  assert.equal(v.childId, "c1");
  assert.equal(v.displayName, "Lina Meier");
  assert.equal(v.islandCount, 2);
  assert.equal("showCompanies" in v, false, "no with/without company names option any more");
  assert.deepEqual(v.applications, [
    { id: "u1-app-1", company: "Swisscom", position: "Informatikerin EFZ", location: "Bern", category: "other", status: "offer", createdAt: "2026-10-01", updatedAt: "2026-10-05", appliedAt: "2026-10-02", deadline: "2026-11-30" },
    { id: "u1-app-3", company: "Roche", position: "Laborant", category: "other", status: "rejected", createdAt: "2026-10-03", updatedAt: "2026-10-09" },
  ]);
  assert.deepEqual(v.layouts, [{ id: "house:u1-app-1", x: 4, z: 8, rotation: 1 }], "only layouts of existing houses, with the real id");
  assert.deepEqual(v.items.map((i) => [i.id, i.itemType, i.x, i.z]), [["i1", "tree", 8, 12], ["i3", "bench", null, null]]);
  const text = JSON.stringify(v);
  for (const secret of ["geheim", "5000", "chef@x.ch", "https://x.ch", "Frau Chefin", "Weg AG", "notes", "salary"]) assert.ok(!text.includes(secret), secret);
});

test("real results are kept (no masking): Zusage = palace, Absage = ruin, exactly like the child's own village", () => {
  const houses = ["saved", "preparing", "applied", "interview", "final_interview", "offer", "rejected", "withdrawn"].map((status, i) => ({ id: `real-${i}`, status, company: `Firma ${i}`, position: "X", createdAt: `2026-10-0${i + 1}`, updatedAt: "2026-10-09" }));
  const v = parseFamilyVillage(payload({ houses, layouts: [{ id: "house:real-6", x: 1, z: 2, rotation: 0 }] }));
  assert.deepEqual(v.applications.map((a) => a.status), houses.map((h) => h.status));
  assert.deepEqual(v.applications.map((a) => a.id), houses.map((h) => h.id));
  assert.deepEqual(v.layouts, [{ id: "house:real-6", x: 1, z: 2, rotation: 0 }]);
});

test("an older RPC payload (pseudo ids, no company, no dates) still renders: visible «Haus N» labels in RPC order", () => {
  const v = parseFamilyVillage({ houses: [{ id: "h0001", status: "applied", company: null }, { id: "h0002", status: "interview", company: "UBS" }] });
  assert.deepEqual(v.applications.map((a) => [a.id, a.company, a.position, a.createdAt]), [["h0001", "Haus 1", "", "000000"], ["h0002", "UBS", "", "000001"]]);
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

test("the Dorf page renders the child's own VillageMap in watch mode and only calls family_child_village", async () => {
  assert.equal(familyVillagePath("a b"), "/familie/kind/a%20b/dorf");
  const page = await read("../app/familie/kind/[id]/dorf/page.tsx");
  const lib = await read("../lib/family-village.ts");
  const own = await read("../app/map/page.tsx");
  assert.match(page, /<VillageMap watch=\{\{/);
  assert.match(own, /<VillageMap \/>/, "the child's /map renders the same component");
  assert.doesNotMatch(page, /ReadOnlyVillageView|ApplicationMapWorld|useMapShop|map_shop|getApplications|\.from\(/, "no parallel parent-only rendering path, no other data source");
  assert.match(lib, /supabase\.rpc\("family_child_village", \{ p_child_id: childId \}\)/);
  assert.equal((lib.match(/\.rpc\(/g) ?? []).length, 1);
  const card = await read("../components/family/child-overview.tsx");
  assert.match(card, /data\.village \?[\s\S]*familyVillagePath\(childId\)[\s\S]*Dorf ansehen[\s\S]*: <p/);
});

test("watch mode of VillageMap: every write path is gated (no shop, points, add, palace, drag, placement, status form, refresh loaders)", async () => {
  const view = await read("../components/applications/village-map.tsx");
  const shop = await read("../components/applications/map-shop.tsx");
  const islands = await read("../components/applications/use-islands.ts");
  const dialog = await read("../components/applications/map-application-dialog.tsx");
  const world = await read("../components/applications/application-map-world.tsx");
  // loaders are skipped and writes return early when watching
  assert.match(view, /useEffect\(\(\) => \{\n\s+if \(watching\) return;[\s\S]*getApplications\(\)/);
  assert.match(shop, /useEffect\(\(\) => \{\n\s+if \(watching\) return;[\s\S]*getMapShop\(\)/);
  for (const fn of ["async function buy", "async function save", "async function commitMove", "function start"]) {
    const body = shop.slice(shop.indexOf(fn), shop.indexOf(fn) + 200);
    assert.match(body, /if \(watching \|\|/, `${fn} is gated`);
  }
  assert.match(islands, /useEffect\(\(\) => \{\n\s+if \(watching\) return;[\s\S]*getIslands\(\)/);
  assert.match(islands, /if \(watching \|\| locked\.current/);
  // in watch mode: read-only world (drag locked, only houses can be opened), read-only sheet, no shop / points / add / palace
  assert.match(view, /<ApplicationMapWorld \{\.\.\.worldData\} readOnly openHouses selectedShopItemId=\{null\} placement=\{null\}[^\n]*drag=\{lockedDrag\}/);
  assert.match(view, /<MapApplicationDialog key=\{selected\.id\} application=\{selected\} readOnly /);
  assert.match(view, /right=\{watch \? \(\n\s+<MapChip id="watch-info"/);
  for (const own of ["<PalaceCelebration", "<MapPlacementTools", "<MapSheet id=\"shop\""]) assert.match(view, new RegExp(`\\{!watch && \\(?\\s*${own}`), own);
  assert.match(dialog, /\{readOnly \? <p[^\n]*Nur ansehen[\s\S]*<form[\s\S]*Haus verschieben[\s\S]*Bewerbung öffnen[\s\S]*<\/>\}/);
  assert.match(dialog, /if \(readOnly \|\| saving\.current/);
  assert.match(dialog, /\{!readOnly && application\.notes &&/);
  assert.match(world, /onSelectShopItem: noopHandler, onPlacePosition: noopHandler, drag: lockedDrag, placement: null/);
});
