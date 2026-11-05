import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { badgeLabel, badgeText, countIncoming, parseMock } from "../lib/friend-badge.ts";

test("counts only incoming requests", () => {
  assert.equal(countIncoming([]), 0);
  assert.equal(countIncoming([{ state: "friend" }, { state: "outgoing" }, { state: "incoming" }, { state: "incoming" }]), 2);
  assert.equal(countIncoming([{ state: "outgoing" }, { state: "friend" }]), 0);
});
test("badge text: hidden at 0, number up to 9, 9+ above", () => {
  assert.equal(badgeText(0), ""); assert.equal(badgeText(-2), ""); assert.equal(badgeText(1), "1"); assert.equal(badgeText(9), "9"); assert.equal(badgeText(10), "9+"); assert.equal(badgeText(250), "9+");
});
test("aria label is German with correct plural", () => {
  assert.equal(badgeLabel(1), "1 offene Freundschaftsanfrage"); assert.equal(badgeLabel(3), "3 offene Freundschaftsanfragen"); assert.equal(badgeLabel(12), "12 offene Freundschaftsanfragen");
});
test("mock env parsing", () => {
  assert.equal(parseMock(undefined), null); assert.equal(parseMock(""), null); assert.equal(parseMock("abc"), null); assert.equal(parseMock("3"), 3); assert.equal(parseMock("-4"), 0); assert.equal(parseMock("2.9"), 2);
});
test("existing social_list RPC marks incoming requests (no new migration needed)", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260101000001_social.sql", import.meta.url), "utf8");
  assert.match(sql, /else 'incoming' end/);
});
test("shell wires the badge into mobile + desktop nav and the friends page updates it", async () => {
  const shell = await readFile(new URL("../components/layout/workspace-shell.tsx", import.meta.url), "utf8");
  assert.equal((shell.match(/<RequestBadge/g) ?? []).length, 2);
  const view = await readFile(new URL("../components/friends/friends-view.tsx", import.meta.url), "utf8");
  assert.match(view, /setRequestCount\(/);
});
