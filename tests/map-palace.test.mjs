import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { hasPalace, hasSeenPalace, isAcceptedStatus, isPalace, markPalaceSeen, PALACE_RISE_MS, palaceApplications, palaceRiseProgress, palaceSeenKey, unseenPalaces } from "../lib/map-palace.ts";
import { buildingStages } from "../lib/application-map.ts";

const app = (id, status, createdAt = "2026-11-01") => ({ id, status, createdAt, company: `Firma ${id}`, position: "KV" });
function memoryStorage() {
  const data = new Map();
  return { data, getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => { data.set(key, String(value)); } };
}

test("only Zusage (offer) and contract_signed count as accepted", () => {
  for (const status of Object.keys(buildingStages)) assert.equal(isAcceptedStatus(status), status === "offer" || status === "contract_signed", status);
  assert.equal(isAcceptedStatus(undefined), false);
  assert.equal(isAcceptedStatus(null), false);
  assert.equal(isAcceptedStatus("Zusage"), false, "the label is not a status");
});

test("palaceApplications keeps order and picks accepted ones only", () => {
  const list = [app("a", "applied"), app("b", "offer"), app("c", "rejected"), app("d", "contract_signed")];
  assert.deepEqual(palaceApplications(list).map(({ id }) => id), ["b", "d"]);
  assert.equal(hasPalace(list), true);
  assert.equal(hasPalace([app("x", "interview")]), false);
  assert.deepEqual(palaceApplications([]), []);
});

test("palace toggles on and off purely with the status (no stored state)", () => {
  const application = app("p", "final_interview");
  assert.equal(isPalace(application), false);
  const accepted = { ...application, status: "offer" };
  assert.equal(isPalace(accepted), true);
  const signed = { ...accepted, status: "contract_signed" };
  assert.equal(isPalace(signed), true);
  const back = { ...signed, status: "interview" };
  assert.equal(isPalace(back), false, "reverts to the normal house");
  assert.equal(isPalace({ ...back, status: "withdrawn" }), false);
});

test("celebration seen flag is per application and stored under wendapply:palace-seen:<id>", () => {
  const storage = memoryStorage();
  assert.equal(palaceSeenKey("abc"), "wendapply:palace-seen:abc");
  assert.equal(hasSeenPalace("abc", storage), false);
  markPalaceSeen("abc", storage);
  assert.equal(storage.data.get("wendapply:palace-seen:abc"), "1");
  assert.equal(hasSeenPalace("abc", storage), true);
  assert.equal(hasSeenPalace("other", storage), false);
});

test("unseenPalaces: oldest first, skips seen ones and non-accepted ones", () => {
  const storage = memoryStorage();
  const list = [app("late", "offer", "2026-11-10"), app("early", "contract_signed", "2026-10-01"), app("no", "applied", "2026-09-01")];
  assert.deepEqual(unseenPalaces(list, storage).map(({ id }) => id), ["early", "late"]);
  markPalaceSeen("early", storage);
  assert.deepEqual(unseenPalaces(list, storage).map(({ id }) => id), ["late"]);
  // Status switched back and forth: still seen, no second celebration.
  const reverted = list.map((item) => item.id === "early" ? { ...item, status: "interview" } : item);
  assert.deepEqual(unseenPalaces(reverted, storage).map(({ id }) => id), ["late"]);
  assert.deepEqual(unseenPalaces(list, storage).map(({ id }) => id), ["late"]);
});

test("SSR / no storage / broken storage: nothing celebrates and nothing throws", () => {
  assert.equal(hasSeenPalace("x", null), true);
  assert.deepEqual(unseenPalaces([app("x", "offer")], null), []);
  assert.doesNotThrow(() => markPalaceSeen("x", null));
  const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
  assert.equal(hasSeenPalace("x", broken), true);
  assert.doesNotThrow(() => markPalaceSeen("x", broken));
  // Default argument outside a browser (node has no window): counts as seen.
  assert.equal(hasSeenPalace("x"), true);
});

test("rise progress: eases 0 -> 1 over PALACE_RISE_MS, instant with reduced motion", () => {
  assert.equal(palaceRiseProgress(0), 0);
  assert.ok(palaceRiseProgress(PALACE_RISE_MS / 2) > 0.5, "ease-out");
  assert.equal(palaceRiseProgress(PALACE_RISE_MS), 1);
  assert.equal(palaceRiseProgress(PALACE_RISE_MS * 3), 1);
  assert.equal(palaceRiseProgress(-50), 0);
  assert.equal(palaceRiseProgress(10, true), 1);
  assert.ok(PALACE_RISE_MS >= 1000 && PALACE_RISE_MS <= 2000);
});

test("map world draws palaces for accepted houses, overlay text and reduced-motion CSS exist", async () => {
  const world = await readFile(new URL("../components/applications/application-map-world.tsx", import.meta.url), "utf8");
  assert.match(world, /if \(isPalace\(application\)\)/);
  assert.match(world, /riseStart: motion \?/, "no rise with prefers-reduced-motion");
  const overlay = await readFile(new URL("../components/applications/palace-celebration.tsx", import.meta.url), "utf8");
  assert.match(overlay, /Zusage! Dein Haus ist jetzt ein Palast\./);
  assert.match(overlay, /aria-live="polite"/);
  assert.doesNotMatch(overlay, /ß/);
  const css = await readFile(new URL("../app/map/map.module.css", import.meta.url), "utf8");
  const block = css.slice(css.indexOf("/* === Palace (shop-v2) === */"));
  assert.ok(block.length > 40, "marked palace CSS block");
  assert.match(block, /prefers-reduced-motion: no-preference/, "animations only without reduced motion");
  const page = await readFile(new URL("../components/applications/village-map.tsx", import.meta.url), "utf8");
  assert.match(page, /celebratePalaceId=\{palace\.application\?\.id \?\? null\}/);
  assert.match(page, /\{!watch && <PalaceCelebration/, "a parent watching the village gets no celebration");
  const friend = await readFile(new URL("../components/friends/friend-island-view.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(friend, /PalaceCelebration|celebratePalaceId/, "friends see the palace, but no celebration");
});
