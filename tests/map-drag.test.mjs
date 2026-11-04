import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMove, evaluateDrop, grabOffset, nudgePosition, samePosition, snapDragPosition } from "../lib/map-drag.ts";
import { villageObjects } from "../lib/map-shop.ts";

const apps = Array.from({ length: 3 }, (_, index) => ({ id: `app-${index}`, company: `Firma ${index}`, position: "Stelle", category: "software", status: "applied", createdAt: "2026-11-04", updatedAt: "2026-11-04" }));
const bench = { id: "bench-1", itemType: "bench", x: 20, z: 0, rotation: 0, createdAt: "2026-11-04" };
const tree = { id: "tree-1", itemType: "tree", x: 24, z: 0, rotation: 0, createdAt: "2026-11-04" };

test("drag position snaps to whole cells and keeps the grabbed spot under the pointer", () => {
  const grab = grabOffset({ x: 21.7, z: 0.2 }, { x: 20, z: 0 });
  assert.deepEqual(grab, { x: 1, z: 0 });
  assert.deepEqual(snapDragPosition({ x: 25.99, z: 3.01 }, grab, 1), { x: 24, z: 3, rotation: 1 });
  assert.deepEqual(snapDragPosition({ x: -0.2, z: -0.9 }, { x: 0, z: 0 }, 0), { x: -1, z: -1, rotation: 0 });
});

test("a free spot is a valid drop", () => {
  assert.deepEqual(evaluateDrop(bench, { x: 22, z: 4, rotation: 0 }, [bench, tree]), { valid: true, reason: "ok" });
  assert.deepEqual(evaluateDrop(bench, { x: 20, z: 0, rotation: 0 }, [bench, tree]), { valid: true, reason: "ok" }, "own old footprint never blocks");
});

test("drops outside the island, on other items, on the fountain plaza and on streets are rejected with a reason", () => {
  const objects = villageObjects(apps);
  const items = [bench, tree, ...objects];
  const street = objects.find(({ itemType }) => itemType === "street");
  const house = objects.find(({ itemType }) => itemType === "house");
  assert.equal(evaluateDrop(bench, { x: 40, z: 0, rotation: 0 }, items).reason, "bounds");
  assert.equal(evaluateDrop(bench, { x: -11, z: 0, rotation: 0 }, items).reason, "bounds");
  assert.equal(evaluateDrop(bench, { x: 0, z: -8, rotation: 0 }, items).reason, "bounds");
  assert.equal(evaluateDrop(bench, { x: 23, z: 0, rotation: 0 }, items).reason, "overlap");
  assert.equal(evaluateDrop(bench, { x: -4, z: -5, rotation: 0 }, items).reason, "water");
  assert.equal(evaluateDrop(bench, { x: street.x, z: street.z, rotation: 0 }, items).reason, "street");
  assert.equal(evaluateDrop(bench, { x: house.x + 1, z: house.z + 1, rotation: 0 }, items).reason, "overlap");
  for (const reason of ["bounds", "water", "street", "overlap"]) assert.equal(evaluateDrop(bench, { x: 23, z: 0, rotation: 0 }, items).valid, false, reason);
});

test("streets and bridges are never draggable, wherever they are dropped", () => {
  const objects = villageObjects(apps);
  const street = objects.find(({ itemType }) => itemType === "street");
  assert.deepEqual(evaluateDrop(street, { x: 30, z: 5, rotation: 0 }, objects), { valid: false, reason: "locked" });
  assert.deepEqual(evaluateDrop({ id: "street:custom", itemType: "road" }, { x: 30, z: 5, rotation: 0 }, objects), { valid: false, reason: "locked" });
});

test("houses can be dropped on free ground and rotation is kept in the footprint check", () => {
  const objects = villageObjects(apps);
  const house = objects.find(({ itemType }) => itemType === "house");
  assert.equal(evaluateDrop(house, { x: 20, z: 0, rotation: 1 }, objects).valid, true);
  assert.equal(evaluateDrop(bench, { x: 32, z: 0, rotation: 1 }, [bench]).valid, true);
  assert.equal(evaluateDrop(bench, { x: 32, z: 0, rotation: 0 }, [bench]).reason, "bounds");
});

test("keyboard nudge moves one cell and ignores other keys", () => {
  const start = { x: 5, z: 5, rotation: 2 };
  assert.deepEqual(nudgePosition(start, "ArrowRight"), { x: 6, z: 5, rotation: 2 });
  assert.deepEqual(nudgePosition(start, "ArrowUp"), { x: 5, z: 4, rotation: 2 });
  assert.equal(nudgePosition(start, "a"), null);
  assert.equal(samePosition(start, { ...start }), true);
});

test("optimistic state update moves houses via layouts and inventory items in place, leaving the original untouched", () => {
  const state = { balance: 1, earned: 1, rewardCount: 0, items: [bench, tree], layouts: [{ id: "house:app-0", x: 1, z: 1, rotation: 0 }] };
  const house = applyMove(state, { id: "house:app-0", itemType: "house" }, { x: 9, z: 9, rotation: 0 });
  assert.deepEqual(house.layouts, [{ id: "house:app-0", x: 9, z: 9, rotation: 0 }]);
  const newHouse = applyMove(state, { id: "house:app-1", itemType: "house" }, { x: 2, z: 2, rotation: 0 });
  assert.equal(newHouse.layouts.length, 2);
  const moved = applyMove(state, bench, { x: 22, z: 4, rotation: 0 });
  assert.deepEqual([moved.items[0].x, moved.items[0].z, moved.items[1].x], [22, 4, 24]);
  assert.equal(state.items[0].x, 20);
  assert.equal(state.layouts[0].x, 1);
});
