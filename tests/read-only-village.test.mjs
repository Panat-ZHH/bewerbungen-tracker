// Two read-only villages since 2026-11-22 (Panat 19:06, migration 20261122190000_family_child_village_full_details.sql):
// - friend view (/friends/[id]): ReadOnlyVillageView with pseudo ids, masked results, «Haus N» unless shared (unchanged).
// - parent view (/familie/kind/[id]/dorf): the child's OWN village component (VillageMap, as on /map) in watch mode, with the
//   child's own house data: same ids, companies, Stellen, statuses and dates, so the 3D village is identical to the child's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseFamilyVillage } from "../lib/family-village.ts";
import { parseFriendIsland } from "../lib/friend-island.ts";
import { fromRow } from "../lib/application-rows.ts";
import { houseLabel, readOnlyWorldProps } from "../lib/read-only-village.ts";
import { lockedDrag } from "../lib/map-readonly.ts";
import { villageObjects } from "../lib/map-shop.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const statuses = ["saved", "rejected", "applied", "interview", "preparing", "offer"];
const companies = ["Swisscom", "UBS", "SBB", "Migros", "Roche", "Zühlke"];

/** The child's applications rows as /map reads them (lib/storage.ts getApplications -> fromRow), newest change first. */
const rows = statuses.map((status, i) => ({ id: `u1-app-${1000 + i}`, user_id: "u1", company: companies[i], position: `Stelle ${i}`, location: i % 2 ? null : "Bern", category: "software", status,
  created_at: `2026-10-0${i + 1}`, updated_at: `2026-10-1${i}`, applied_at: i > 1 ? `2026-10-0${i + 2}` : null, deadline: i === 3 ? "2026-12-01" : null, notes: "GEHEIM", salary_min: 5000, job_url: "https://x.ch", contact_name: "Chef" })).reverse();
/** What family_child_village returns for the same child (oldest first, only the fields the village shows). */
const rpc = { child_id: "u1", display_name: "Lina", island_count: 3, layouts: [{ id: "house:u1-app-1002", x: 4, z: 8, rotation: 1 }], items: [],
  houses: [...rows].reverse().map((r) => ({ id: r.id, company: r.company, position: r.position, location: r.location, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, appliedAt: r.applied_at, deadline: r.deadline })) };
const shown = ({ id, company, position, location, status, createdAt, updatedAt, appliedAt, deadline }) => ({ id, company, position, location, status, createdAt, updatedAt, appliedAt, deadline });
const byId = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id));

test("parent village = the child's own village: same houses with the same label + sheet fields, same places on the map", () => {
  const child = rows.map(fromRow);
  const parent = parseFamilyVillage(rpc);
  assert.deepEqual(byId(parent.applications).map(shown), byId(child).map(shown));
  const place = (apps) => villageObjects(apps, rpc.layouts).map(({ id, x, z, rotation }) => [id, x, z, rotation]);
  assert.deepEqual(place(parent.applications), place(child), "same house order, positions and moved house");
  for (const a of parent.applications) assert.equal(a.notes, undefined, "notes never reach the parent");
});

test("friend view is unchanged: pseudo ids and «Haus N» unless the friend shares company names", () => {
  const friend = parseFriendIsland({ userId: "c1", displayName: "Lina", islands: 1, companiesShared: false, outcomesShared: false, items: [], layouts: [],
    applications: statuses.map((status, i) => ({ id: `h000${i + 1}`, status, createdAt: `2026-10-0${i + 1}` })) });
  assert.deepEqual(friend.applications.map((a) => a.company), statuses.map((_, i) => houseLabel(i)));
  const props = readOnlyWorldProps({ applications: friend.applications, items: friend.items, layouts: friend.layouts, islandCount: friend.islands });
  assert.equal(props.readOnly, true);
  assert.equal(props.drag, lockedDrag);
  assert.equal(props.drag.enabled, false);
  assert.equal(props.selectedId, null);
  assert.equal(props.selectedShopItemId, null);
  assert.equal(props.placement, null);
  for (const handler of [props.onSelect, props.onSelectShopItem, props.onPlacePosition]) assert.equal(handler("x"), undefined);
});

test("pages: friend -> ReadOnlyVillageView, parent -> the child's VillageMap (watch), child -> VillageMap; no extra motion switch", async () => {
  const friend = await read("../components/friends/friend-island-view.tsx");
  const parent = await read("../app/familie/kind/[id]/dorf/page.tsx");
  const own = await read("../app/map/page.tsx");
  const village = await read("../components/applications/village-map.tsx");
  const css = await read("../app/familie/kind/[id]/dorf/dorf.module.css");
  assert.match(friend, /<ReadOnlyVillageView\b/);
  assert.match(parent, /<VillageMap watch=\{\{/);
  assert.match(own, /<VillageMap \/>/);
  for (const page of [friend, parent]) assert.doesNotMatch(page, /ApplicationMapWorld|lockedDrag|noopHandler/, "map props come from the shared components");
  assert.doesNotMatch(css, /data-building|display:\s*none/, "no CSS that hides house labels or the map");
  assert.doesNotMatch(parent + village, /prefers-reduced-motion|reducedMotion/, "no extra motion switch on top of the map's own");
});
