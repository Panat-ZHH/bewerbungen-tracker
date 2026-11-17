// Flows re-audit 2: normal classroom use from one school IP must fit the Next API route limits; the village claims
// deferred coin rewards; the guide explains the daily cap; CV uploads use a storage path the cvs constraint accepts.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { register } from "node:module";

register("./helpers/alias-hooks.mjs", import.meta.url);

const api = await import("../lib/api-rate-limit.ts");
const { safeFileName } = await import("../lib/documents-core.ts");
const src = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("job search: one school IP fits a whole class searching at the per-user maximum (the user limit carries the cost)", () => {
  const cfg = api.ROUTE_LIMITS["job-search"];
  assert.equal(cfg.ip.windowSeconds, cfg.user.windowSeconds);
  assert.ok(cfg.ip.limit >= 30 * cfg.user.limit, `ip ${cfg.ip.limit} < 30 pupils × ${cfg.user.limit}`);
  assert.ok(cfg.user.limit <= 12 && cfg.userDay.limit <= 400, "per-user cost protection unchanged");
});

test("job search: 30 pupils × 6 searches in one minute from one IP pass, a 13th search of one pupil is still limited", async () => {
  const { memoryRateLimitRpc } = await import("../lib/rate-limit/index.ts");
  const rpc = memoryRateLimitRpc();
  const headers = new Headers({ "x-nf-client-connection-ip": "198.51.100.10" });
  for (let pupil = 0; pupil < 30; pupil += 1) for (let i = 0; i < 6; i += 1) {
    assert.equal((await api.checkIp("job-search", headers, { rpc })).allowed, true, `pupil ${pupil} search ${i}`);
    assert.equal((await api.checkUser("job-search", `pupil-${pupil}`, { rpc })).allowed, true);
  }
  for (let i = 0; i < 6; i += 1) await api.checkUser("job-search", "pupil-0", { rpc });
  assert.equal((await api.checkUser("job-search", "pupil-0", { rpc })).allowed, false);
});

test("push reminders: a class can switch reminders on together from one IP", () => {
  assert.ok(api.ROUTE_LIMITS["push-subscribe"].ip.limit >= 150);
});

test("village: getMapShop claims deferred application rewards first and never fails because of it", async () => {
  const storage = await src("lib/storage.ts");
  assert.match(storage, /export async function claimApplicationRewards\(\)[^\n]*rpc\("map_claim_application_rewards"\)[^\n]*catch/);
  assert.match(storage, /export async function getMapShop\(\)[^\n]*\{ await claimApplicationRewards\(\); [^\n]*rpc\("map_shop_state"\)/);
});

test("guide: the coin rule mentions the daily cap and the automatic later payout", async () => {
  const guide = await src("components/guide/content.tsx");
  assert.match(guide, /höchstens 10 Bewerbungen pro Tag/);
  assert.match(guide, /an den nächsten Tagen automatisch/);
});

test("CV template upload: the stored path is <uid>/<id>/<safe name> (cvs_storage_path_own_folder accepts it)", async () => {
  const storage = await src("lib/storage.ts");
  assert.match(storage, /const path = `\$\{userId\}\/\$\{id\}\/\$\{safeFileName\(file\.name\)\}`/);
  for (const name of ["Lebenslauf\\Anna.pdf", "..", "a\u0001b.pdf", "../x.pdf"]) {
    const safe = safeFileName(name);
    assert.ok(safe && safe !== "." && safe !== ".." && !/[\\/\u0000-\u001f]/.test(safe), JSON.stringify(safe));
  }
});
