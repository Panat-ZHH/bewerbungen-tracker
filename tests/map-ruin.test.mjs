import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { flameFlicker, houseLook, isRejectedStatus, isRuin, ruinApplications, smokePhase, smokeScale, summaryLook } from "../lib/map-ruin.ts";
import { buildingStages } from "../lib/application-map.ts";

const app = (id, status) => ({ id, status, createdAt: "2026-11-01" });

test("only 'rejected' (Absage erhalten) burns; withdrawn stays a closed house", () => {
  for (const status of Object.keys(buildingStages)) assert.equal(isRejectedStatus(status), status === "rejected", status);
  assert.equal(isRejectedStatus("Absage"), false, "the label is not a status");
  assert.equal(isRejectedStatus(undefined), false);
  assert.equal(houseLook("withdrawn"), "house");
});

test("houseLook: palace for offer/contract_signed, ruin for rejected, house otherwise", () => {
  for (const status of Object.keys(buildingStages)) {
    const expected = status === "offer" || status === "contract_signed" ? "palace" : status === "rejected" ? "ruin" : "house";
    assert.equal(houseLook(status), expected, status);
  }
});

test("ruin is derived purely from the status and reverts when it changes", () => {
  const application = app("r", "rejected");
  assert.equal(isRuin(application), true);
  application.status = "interview";
  assert.equal(isRuin(application), false);
  application.status = "offer";
  assert.equal(isRuin(application), false);
  assert.equal(houseLook(application.status), "palace");
});

test("ruinApplications keeps order", () => {
  const list = [app("a", "rejected"), app("b", "offer"), app("c", "applied"), app("d", "rejected")];
  assert.deepEqual(ruinApplications(list).map(({ id }) => id), ["a", "d"]);
});

test("summaryLook: a palace always wins over ruins", () => {
  assert.equal(summaryLook([app("a", "rejected"), app("b", "offer"), app("c", "rejected")]), "palace");
  assert.equal(summaryLook([app("a", "rejected"), app("b", "applied")]), "ruin");
  assert.equal(summaryLook([app("a", "applied")]), "house");
  assert.equal(summaryLook([]), "house");
});

test("flame flicker stays in a tasteful range and is deterministic", () => {
  for (let t = 0; t < 20; t += 0.037) {
    const value = flameFlicker(t, 3);
    assert.ok(value > 0.7 && value < 1.3, String(value));
  }
  assert.equal(flameFlicker(1.234, 2), flameFlicker(1.234, 2));
});

test("smoke loops 0..1, grows and thins out to zero at the top (no popping)", () => {
  for (let t = -3; t < 30; t += 0.21) {
    const phase = smokePhase(t, 0.4);
    assert.ok(phase >= 0 && phase < 1, String(phase));
  }
  assert.ok(smokeScale(0.5) > smokeScale(0.05));
  assert.ok(smokeScale(0.999) < 0.01);
  assert.equal(smokeScale(1), 0);
});

test("map world draws the ruin before the normal house path, after the palace", async () => {
  const source = await readFile(new URL("../components/applications/application-map-world.tsx", import.meta.url), "utf8");
  const palace = source.indexOf("if (isPalace(application))");
  const ruin = source.indexOf("if (isRuin(application))");
  const house = source.indexOf("const closed = application.status");
  assert.ok(palace > 0 && ruin > palace && house > ruin, "order: palace → ruin → house");
});
