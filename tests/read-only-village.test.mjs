// Parent view of a child's village (/familie/kind/[id]/dorf) == friend view (/friends/[id]): same data shape, same
// read-only props, same screen component. Regression test for «Dorf stillgelegt» (2026-11-22): when the child did not
// share the application list, the parent view hid every house label, so the village looked dead next to the friend view.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseFamilyVillage } from "../lib/family-village.ts";
import { parseFriendIsland } from "../lib/friend-island.ts";
import { houseLabel, readOnlyWorldProps } from "../lib/read-only-village.ts";
import { lockedDrag } from "../lib/map-readonly.ts";
import { villageObjects } from "../lib/map-shop.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const statuses = ["saved", "rejected", "applied", "interview", "preparing", "offer"];
const companies = ["Swisscom", "UBS", "SBB", "Migros", "Roche", "Zühlke"];
const items = [{ id: "i1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" }, { id: "i2", itemType: "bench", x: null, z: null, rotation: 1, createdAt: "2026-10-02" }];
const friendStatus = (status, shared) => (shared || ["saved", "preparing", "applied", "interview", "final_interview"].includes(status) ? status : "applied");

/**
 * The same village once as map_friend_island and once as family_child_village returns it. Default case (2026-11-22, Panat's
 * phone): the child shares neither company names nor results with friends and not the application list with the family.
 * `legacyRpc`: the family RPC before 20261122100000 (real ids + real results); the parser must still give the friend's props.
 */
function both(shared, legacyRpc = false) {
  const friend = parseFriendIsland({
    userId: "c1", displayName: "Lina", islands: 3, companiesShared: shared, outcomesShared: shared, items, layouts: [{ id: "house:h0002", x: 4, z: 8, rotation: 1 }],
    applications: statuses.map((status, i) => ({ id: `h000${i + 1}`, status: friendStatus(status, shared), createdAt: `2026-10-0${i + 1}`, ...(shared ? { company: companies[i] } : {}) })),
  });
  const id = (i) => (legacyRpc ? `0f6c-real-${i}` : `h000${i + 1}`);
  const parent = parseFamilyVillage({
    child_id: "c1", display_name: "Lina", island_count: 3, show_companies: shared, items, layouts: [{ id: `house:${id(1)}`, x: 4, z: 8, rotation: 1 }],
    houses: statuses.map((status, i) => ({ id: id(i), status: legacyRpc ? status : friendStatus(status, shared), company: shared ? companies[i] : null })),
  });
  return { friend: { applications: friend.applications, items: friend.items, layouts: friend.layouts, islandCount: friend.islands }, parent };
}
const visible = (props) => ({ ...props, applications: props.applications.map(({ id, company, status, position, category }) => ({ id, company, status, position, category })) });

for (const [shared, legacyRpc] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`parity (${shared ? "applications shared" : "applications NOT shared"}${legacyRpc ? ", old RPC payload" : ""}): parent gets exactly the friend's map props`, () => {
    const { friend, parent } = both(shared, legacyRpc);
    const a = readOnlyWorldProps(friend);
    const b = readOnlyWorldProps(parent);
    assert.deepEqual(visible(b), visible(a));
    // Same house order and the same positions on the map (houses, streets = villager routes).
    const place = (v) => villageObjects(v.applications, v.layouts).map(({ id, x, z, rotation }) => [id, x, z, rotation]);
    assert.deepEqual(place(parent), place(friend));
  });
}

test("every house keeps a visible label: company name if shared, otherwise «Haus N» (never empty)", () => {
  assert.deepEqual(both(false).parent.applications.map((a) => a.company), statuses.map((_, i) => houseLabel(i)));
  assert.deepEqual(both(true).parent.applications.map((a) => a.company), companies);
  const mixed = parseFamilyVillage({ show_companies: true, houses: [{ id: "a", status: "applied", company: "  " }, { id: "b", status: "offer", company: "UBS" }] });
  assert.deepEqual(mixed.applications.map((a) => a.company), ["Haus 1", "UBS"]);
  for (const a of both(false).parent.applications) assert.ok(a.company.trim().length > 0);
});

test("read-only props: nothing selectable, placeable or draggable", () => {
  const props = readOnlyWorldProps(both(true).parent);
  assert.equal(props.readOnly, true);
  assert.equal(props.drag, lockedDrag);
  assert.equal(props.drag.enabled, false);
  assert.equal(props.selectedId, null);
  assert.equal(props.selectedShopItemId, null);
  assert.equal(props.placement, null);
  assert.deepEqual(props.visibleIds, ["h0001", "h0002", "h0003", "h0004", "h0005", "h0006"]);
  assert.equal(props.islandCount, 3);
  for (const handler of [props.onSelect, props.onSelectShopItem, props.onPlacePosition]) assert.equal(handler("x"), undefined);
});

test("both pages render the one shared ReadOnlyVillageView; the parent page hides no labels and pauses nothing", async () => {
  const friend = await read("../components/friends/friend-island-view.tsx");
  const parent = await read("../app/familie/kind/[id]/dorf/page.tsx");
  const view = await read("../components/applications/read-only-village-view.tsx");
  const css = await read("../app/familie/kind/[id]/dorf/dorf.module.css");
  for (const page of [friend, parent]) {
    assert.match(page, /<ReadOnlyVillageView\b/);
    assert.doesNotMatch(page, /ApplicationMapWorld|lockedDrag|noopHandler/, "map props only come from the shared view");
  }
  assert.match(view, /<ApplicationMapWorld \{\.\.\.readOnlyWorldProps\(village\)\} night=\{night\}/);
  assert.doesNotMatch(view, /celebratePalaceId|useMapShop|ShopPanel|map_shop|coins|balance/);
  assert.doesNotMatch(css, /data-building|display:\s*none/, "no CSS that hides house labels or the map");
  assert.doesNotMatch(parent + view, /prefers-reduced-motion|paused|reducedMotion/, "no extra motion switch on top of the map's own");
});
