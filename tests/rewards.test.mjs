import assert from "node:assert/strict";
import { test } from "node:test";
import { bumpProgress, clampGoal, emptyProgress, weekStart } from "../lib/rewards-core.ts";

test("weekStart returns the Monday of the week", () => {
  assert.equal(weekStart(new Date(2026, 10, 6)), "2026-11-02"); // Friday
  assert.equal(weekStart(new Date(2026, 10, 8)), "2026-11-02"); // Sunday
  assert.equal(weekStart(new Date(2026, 10, 9)), "2026-11-09"); // Monday
});
test("clampGoal keeps the goal between 1 and 20", () => {
  assert.equal(clampGoal(0), 1);
  assert.equal(clampGoal(99), 20);
  assert.equal(clampGoal("abc"), 3);
  assert.equal(clampGoal(5), 5);
});
test("bumpProgress counts within a week and resets in a new week", () => {
  const monday = new Date(2026, 10, 2);
  let p = bumpProgress(null, "applied", monday);
  p = bumpProgress(p, "applied", new Date(2026, 10, 4));
  assert.equal(p.applied, 2);
  const next = bumpProgress(p, "saved", new Date(2026, 10, 10));
  assert.deepEqual(next, { ...emptyProgress("2026-11-09"), saved: 1 });
});
