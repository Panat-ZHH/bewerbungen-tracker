import assert from "node:assert/strict";
import { test } from "node:test";
import { buildingStages, createApplicationMap } from "../lib/application-map.ts";

function application(id, status = "saved") {
  return { id, status, company: `Firma ${id}`, position: "Entwicklung", category: "software", createdAt: "2026-11-03", updatedAt: "2026-11-03" };
}

test("all application statuses have a distinct building stage; early stages have workers", () => {
  assert.deepEqual(Object.keys(buildingStages), ["saved", "preparing", "applied", "schnupper_planned", "schnupper_done", "aptitude_test", "interview", "final_interview", "offer", "contract_signed", "rejected", "withdrawn"]);
  assert.equal(new Set(Object.values(buildingStages).map(({ label }) => label)).size, 12);
  assert.deepEqual(Object.entries(buildingStages).filter(([, stage]) => stage.workers).map(([status]) => status), ["saved", "preparing"]);
  assert.ok(buildingStages.interview.floors > buildingStages.applied.floors);
  assert.ok(buildingStages.final_interview.floors > buildingStages.interview.floors);
});

test("every application gets its own plot inside a growing map", () => {
  for (const count of [0, 1, 8, 100]) {
    const input = Array.from({ length: count }, (_, index) => application(`app-${index}`));
    const map = createApplicationMap(input);
    assert.equal(map.plots.length, count);
    assert.equal(new Set(map.plots.map(({ x, y }) => `${x},${y}`)).size, count);
    assert.ok(map.height >= 900);
    for (const { x, y } of map.plots) {
      assert.ok(x - 130 >= 0 && x + 130 <= map.width);
      assert.ok(y - 150 >= 0 && y + 130 < map.height);
      assert.ok(x - 130 > 220);
    }
    for (let index = 1; index < map.plots.length; index++) {
      const current = map.plots[index];
      const previous = map.plots[index - 1];
      assert.ok(Math.abs(current.x - previous.x) >= 260 || Math.abs(current.y - previous.y) >= 280);
    }
  }
});

test("status changes and server ordering do not move buildings or mutate inputs", () => {
  const input = [application("b"), application("a"), application("c")];
  const original = createApplicationMap(input).plots.map(({ application, x, y }) => [application.id, x, y]);
  const changed = createApplicationMap([...input].reverse().map((item) => ({ ...item, status: "offer" }))).plots.map(({ application, x, y }) => [application.id, x, y]);
  assert.deepEqual(original, changed);
  assert.deepEqual(input.map(({ id }) => id), ["b", "a", "c"]);
});