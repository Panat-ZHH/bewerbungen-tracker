// scripts/admin/purge-unconfirmed.mjs (SPEC-DATA §3.11): dry run by default, only never-confirmed + never-signed-in users older than
// N days, ledger release before delete, no ids/keys in the output. fetch is stubbed – no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCandidate, parseArgs, run } from "../scripts/admin/purge-unconfirmed.mjs";

const NOW = Date.parse("2026-11-19T12:00:00Z");
const DAY = 86400000;
const users = [
  { id: "u-old-unconf", email: "old.unconf@example.ch", created_at: new Date(NOW - 10 * DAY).toISOString(), email_confirmed_at: null, last_sign_in_at: null },
  { id: "u-new-unconf", email: "new@example.ch", created_at: new Date(NOW - 2 * DAY).toISOString(), email_confirmed_at: null, last_sign_in_at: null },
  { id: "u-confirmed", email: "conf@example.ch", created_at: new Date(NOW - 30 * DAY).toISOString(), email_confirmed_at: "2026-10-20T00:00:00Z", last_sign_in_at: "2026-10-20T00:00:00Z" },
  { id: "u-google", email: "g@example.ch", created_at: new Date(NOW - 30 * DAY).toISOString(), email_confirmed_at: null, last_sign_in_at: "2026-10-20T00:00:00Z" },
];
function fakeFetch(calls, { release = true } = {}) {
  return async (url, init = {}) => {
    calls.push([init.method ?? "GET", url, init.body ?? null]);
    if (url.includes("/auth/v1/admin/users?")) return new Response(JSON.stringify({ users }), { status: 200 });
    if (url.includes("/rpc/privacy_release_unconfirmed_trial")) return new Response(JSON.stringify(release), { status: 200 });
    return new Response(null, { status: 204 });
  };
}

test("args: dry run default, --days bounds, unknown args refused", () => {
  assert.deepEqual(parseArgs([]), { days: 7, apply: false });
  assert.deepEqual(parseArgs(["--days", "14", "--apply"]), { days: 14, apply: true });
  for (const bad of [["--days", "0"], ["--days", "x"], ["--days", "1.5"], ["--force"]]) assert.throws(() => parseArgs(bad));
});

test("candidates: only never-confirmed, never-signed-in, older than N days", () => {
  assert.deepEqual(users.filter((u) => isCandidate(u, NOW, 7)).map((u) => u.id), ["u-old-unconf"]);
  assert.equal(isCandidate({ id: "x", created_at: "garbage" }, NOW, 7), false);
});

test("dry run deletes nothing and prints no ids / full e-mails / keys", async () => {
  const calls = []; const out = [];
  const r = await run({ url: "https://x.supabase.co", key: "service-key-secret", args: { days: 7, apply: false }, now: NOW, fetchFn: fakeFetch(calls), log: (l) => out.push(l) });
  assert.deepEqual(r, { ok: true, candidates: 1, deleted: 0, failed: 0 });
  assert.ok(calls.every(([m]) => m === "GET"));
  const text = out.join("\n");
  assert.doesNotMatch(text, /u-old-unconf|old\.unconf@|service-key-secret/);
  assert.match(text, /o\*{6}@example\.ch/);
});

test("--apply: release ledger first, then delete, then audit; DB refusal skips the delete", async () => {
  const calls = [];
  const r = await run({ url: "https://x.supabase.co", key: "k", args: { days: 7, apply: true }, now: NOW, fetchFn: fakeFetch(calls), log: () => {} });
  assert.deepEqual(r, { ok: true, candidates: 1, deleted: 1, failed: 0 });
  const writes = calls.filter(([m]) => m !== "GET").map(([m, u]) => `${m} ${u.replace("https://x.supabase.co", "")}`);
  assert.deepEqual(writes, ["POST /rest/v1/rpc/privacy_release_unconfirmed_trial", "DELETE /auth/v1/admin/users/u-old-unconf", "POST /rest/v1/admin_audit_log"]);
  const calls2 = [];
  const r2 = await run({ url: "https://x.supabase.co", key: "k", args: { days: 7, apply: true }, now: NOW, fetchFn: fakeFetch(calls2, { release: false }), log: () => {} });
  assert.equal(r2.deleted, 0); assert.equal(r2.failed, 1);
  assert.ok(!calls2.some(([m]) => m === "DELETE"));
});

test("refuses publishable / anon keys and missing config", async () => {
  await assert.rejects(run({ url: "https://x", key: "sb_publishable_abc", args: { days: 7, apply: false }, fetchFn: fakeFetch([]) }), /not a service role/);
  await assert.rejects(run({ url: "", key: "", args: { days: 7, apply: false }, fetchFn: fakeFetch([]) }), /required/);
});
